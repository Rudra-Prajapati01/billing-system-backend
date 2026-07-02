const db = require("../config/db");
const { getTenantFilter, requireBusinessAccess } = require("../utils/tenantHelper");
const catchAsync = require("../utils/catchAsync");

// 1. Fetch all payments
exports.getPayments = catchAsync(async (req, res, next) => {
  requireBusinessAccess(req);
  const { filterSql, filterParams } = getTenantFilter(req, "p");
  const [payments] = await db.query(`
    SELECT p.*, i.invoice_no, c.customer_name 
    FROM payments p
    JOIN invoices i ON p.invoice_id = i.id
    JOIN customers c ON i.customer_id = c.id
    WHERE 1=1 ${filterSql}
    ORDER BY p.payment_date DESC, p.id DESC
  `, filterParams);
  res.json(payments);
});

// 2. Add a new payment
exports.addPayment = catchAsync(async (req, res, next) => {
  requireBusinessAccess(req);
  const { invoice_id, payment_date, amount, payment_mode, transaction_ref, remarks } = req.body;

  const { filterSql, filterParams } = getTenantFilter(req, "i");
  
  // Check current outstanding amount to prevent overpayment
  const [summary] = await db.query(`
    SELECT i.grand_total, i.company_id, COALESCE(SUM(p.amount), 0) AS paid_amount
    FROM invoices i
    LEFT JOIN payments p ON p.invoice_id = i.id
    WHERE i.id = ? ${filterSql}
    GROUP BY i.id, i.grand_total, i.company_id
  `, [invoice_id, ...filterParams]);

  if (summary.length === 0) {
    return res.status(404).json({ success: false, message: "Invoice not found." });
  }

  const outstanding = summary[0].grand_total - summary[0].paid_amount;
  const paymentAmount = parseFloat(amount);

  if (paymentAmount <= 0) {
    return res.status(400).json({ success: false, message: "Payment amount must be greater than zero." });
  }

  if (paymentAmount > outstanding) {
    return res.status(400).json({ 
      success: false, 
      message: `Payment amount cannot exceed outstanding balance of INR ${outstanding.toFixed(2)}` 
    });
  }

  const parentCompanyId = summary[0].company_id;

  const [result] = await db.query(
    `INSERT INTO payments (company_id, invoice_id, payment_date, amount, payment_mode, transaction_ref, remarks) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [parentCompanyId, invoice_id, payment_date, paymentAmount, payment_mode, transaction_ref || null, remarks || null]
  );

  res.status(201).json({ success: true, message: "Payment recorded successfully.", paymentId: result.insertId });
});

// 3. Delete a payment
exports.deletePayment = catchAsync(async (req, res, next) => {
  requireBusinessAccess(req);
  const { id } = req.params;
  const { filterSql, filterParams } = getTenantFilter(req);
  
  const [exists] = await db.query(`SELECT id FROM payments WHERE id = ? ${filterSql}`, [id, ...filterParams]);
  if (exists.length === 0) {
    return res.status(404).json({ success: false, message: "Payment not found." });
  }

  await db.query(`DELETE FROM payments WHERE id = ? ${filterSql}`, [id, ...filterParams]);
  res.json({ success: true, message: "Payment deleted successfully." });
});

// 4. Get Invoice Outstanding Summary
exports.getInvoiceSummary = catchAsync(async (req, res, next) => {
  requireBusinessAccess(req);
  const { filterSql, filterParams } = getTenantFilter(req, "i");
  const [invoices] = await db.query(`
    SELECT i.id, i.invoice_no, i.invoice_date, c.customer_name, COALESCE(i.grand_total, 0) as grand_total,
           COALESCE(SUM(p.amount), 0) AS paid_amount,
           (COALESCE(i.grand_total, 0) - COALESCE(SUM(p.amount), 0)) AS outstanding_amount
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN payments p ON p.invoice_id = i.id
    WHERE 1=1 ${filterSql}
    GROUP BY i.id, i.invoice_no, i.invoice_date, c.customer_name, i.grand_total
    ORDER BY i.id DESC
  `, filterParams);
  res.json(invoices);
});

// 5. Update a payment (with overpayment validation guard)
exports.updatePayment = catchAsync(async (req, res, next) => {
  requireBusinessAccess(req);
  const { id } = req.params;
  const { payment_date, amount, payment_mode, transaction_ref, remarks } = req.body;

  const { filterSql, filterParams } = getTenantFilter(req, "p");

  // Fetch current payment detail and invoice total
  const [currentPay] = await db.query(
    `SELECT p.amount, p.invoice_id, i.grand_total 
     FROM payments p 
     JOIN invoices i ON p.invoice_id = i.id 
     WHERE p.id = ? ${filterSql}`,
    [id, ...filterParams]
  );

  if (currentPay.length === 0) {
    return res.status(404).json({
      success: false,
      message: "Payment not found or permission denied."
    });
  }

  const { invoice_id, grand_total } = currentPay[0];

  // Fetch sum of other payments for this invoice
  const { filterSql: otherFilterSql, filterParams: otherFilterParams } = getTenantFilter(req, "p");
  const [otherPays] = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS total_other 
     FROM payments p 
     WHERE p.invoice_id = ? AND p.id != ? ${otherFilterSql}`,
    [invoice_id, id, ...otherFilterParams]
  );

  const otherPaid = parseFloat(otherPays[0].total_other || 0);
  const newAmount = parseFloat(amount);

  if (newAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Payment amount must be greater than zero."
    });
  }

  const maxAllowed = grand_total - otherPaid;
  if (newAmount > maxAllowed) {
    return res.status(400).json({
      success: false,
      message: `Payment amount cannot exceed the outstanding balance of INR ${maxAllowed.toFixed(2)}`
    });
  }

  const [updateResult] = await db.query(
    `UPDATE payments
     SET payment_date=?,
         amount=?,
         payment_mode=?,
         transaction_ref=?,
         remarks=?
     WHERE id=? ${filterSql}`,
    [
      payment_date,
      newAmount,
      payment_mode,
      transaction_ref || null,
      remarks || null,
      id,
      ...filterParams
    ]
  );

  if (updateResult.affectedRows === 0) {
    return res.status(404).json({
      success: false,
      message: "Payment not found or permission denied."
    });
  }

  res.json({
    success: true,
    message: "Payment updated successfully"
  });
});