const db = require("../config/db");
const { getTenantFilter, getInsertCompanyId } = require("../utils/tenantHelper");

// Fetch all invoices (ordered by id DESC)
exports.getInvoices = async (req, res) => {
  try {
    const { filterSql, filterParams } = getTenantFilter(req, "i");
    const [rows] = await db.query(`
      SELECT i.*, c.customer_name 
      FROM invoices i 
      LEFT JOIN customers c ON i.customer_id = c.id 
      WHERE 1=1 ${filterSql}
      ORDER BY i.id DESC
    `, filterParams);
    res.json(rows);
  } catch (err) {
    console.error("Error in getInvoices:", err);
    res.status(500).json({ success: false, message: "Failed to fetch invoices: " + err.message });
  }
};

// Generate the next invoice number
exports.getNextInvoiceNumber = async (req, res) => {
  try {
    const { filterSql, filterParams } = getTenantFilter(req);
    const [rows] = await db.query(`SELECT MAX(invoice_no) AS max_no FROM invoices WHERE 1=1 ${filterSql}`, filterParams);
    if (!rows[0].max_no) {
      return res.json({ nextNumber: "INV-0001" });
    }
    const lastNo = rows[0].max_no;
    const match = lastNo.match(/\d+/);
    if (!match) {
      return res.json({ nextNumber: "INV-0001" });
    }
    const lastNum = parseInt(match[0]);
    const nextNum = lastNum + 1;
    const paddedNum = String(nextNum).padStart(4, "0");
    res.json({ nextNumber: `INV-${paddedNum}` });
  } catch (err) {
    console.error("Error in getNextInvoiceNumber:", err);
    res.status(500).json({ success: false, message: "Failed to generate invoice number." });
  }
};

// Add Invoice (with items in a Transaction)
exports.addInvoice = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    let {
      invoice_no, invoice_date, customer_id, bank_id, terms_id,
      subtotal, gst_amount, grand_total, notes, items
    } = req.body;

    if (!invoice_no || !invoice_date || !customer_id || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: "Required fields are missing." });
    }

    const { filterSql, filterParams } = getTenantFilter(req);
    const companyId = getInsertCompanyId(req);

    const [dup] = await connection.query(`SELECT id FROM invoices WHERE invoice_no = ? ${filterSql}`, [invoice_no.trim(), ...filterParams]);
    if (dup.length > 0) {
      return res.status(400).json({ success: false, message: `Invoice number "${invoice_no.trim()}" already exists.` });
    }

    const [headerResult] = await connection.query(
      `INSERT INTO invoices (company_id, invoice_no, invoice_date, customer_id, subtotal, gst_amount, grand_total, notes, bank_id, terms_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, invoice_no.trim(), invoice_date, customer_id, subtotal || 0, gst_amount || 0, grand_total || 0, notes ? notes.trim() : null, bank_id || null, terms_id || null]
    );
    const invoiceId = headerResult.insertId;

    for (const item of items) {
      let { service_name, description, qty, rate, amount, gst_percent, total } = item;
      await connection.query(
        `INSERT INTO invoice_items
         (company_id, invoice_id, service_name, qty, description, rate, amount, gst_percent, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [companyId, invoiceId, service_name, qty || 1, description, rate || 0, amount || 0, gst_percent || 0, total || 0]
      );
    }

    await connection.commit();
    res.status(201).json({ success: true, message: "Invoice saved successfully", invoiceId });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Error in addInvoice:", err);
    res.status(500).json({ success: false, message: "Failed to save invoice: " + err.message });
  } finally {
    if (connection) connection.release();
  }
};

// Delete Invoice
exports.deleteInvoice = async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    const { filterSql, filterParams } = getTenantFilter(req);
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [exists] = await connection.query(`SELECT id FROM invoices WHERE id = ? ${filterSql}`, [id, ...filterParams]);
    if (exists.length === 0) return res.status(404).json({ success: false, message: "Invoice not found." });

    await connection.query(`DELETE FROM invoices WHERE id = ? ${filterSql}`, [id, ...filterParams]);

    await connection.commit();
    res.json({ success: true, message: "Invoice deleted successfully" });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Error in deleteInvoice:", err);
    res.status(500).json({ success: false, message: "Failed to delete invoice: " + err.message });
  } finally {
    if (connection) connection.release();
  }
};

// Fetch invoice details with items & payment history
exports.getInvoiceById = async (req, res) => {
  const { id } = req.params;

  try {
    const { filterSql, filterParams } = getTenantFilter(req);

    // Invoice Header
    const [headerResult] = await db.query(
      `SELECT * FROM invoices WHERE id = ? ${filterSql}`,
      [id, ...filterParams]
    );

    if (headerResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found."
      });
    }

    // Invoice Items
    const [items] = await db.query(
      `SELECT * FROM invoice_items WHERE invoice_id = ? ${filterSql}`,
      [id, ...filterParams]
    );

    // Total Paid Amount
    const [paymentResult] = await db.query(
      `SELECT COALESCE(SUM(amount),0) AS paid_amount
       FROM payments
       WHERE invoice_id = ? ${filterSql}`,
      [id, ...filterParams]
    );

    // Payment History (Latest First)
    const [payments] = await db.query(
      `SELECT
          id,
          payment_date,
          amount,
          payment_mode,
          transaction_ref,
          remarks,
          created_at
       FROM payments
       WHERE invoice_id = ? ${filterSql}
       ORDER BY payment_date DESC, id DESC`,
      [id, ...filterParams]
    );

    const header = headerResult[0];

    header.paid_amount = parseFloat(
      paymentResult[0].paid_amount || 0
    );

    header.outstanding_amount =
      parseFloat(header.grand_total || 0) -
      parseFloat(header.paid_amount || 0);

    res.json({
      success: true,
      header,
      items,
      payments
    });

  } catch (err) {
    console.error("Error in getInvoiceById:", err);

    res.status(500).json({
      success: false,
      message:
        "Failed to fetch invoice details: " + err.message
    });
  }
};

// Update Invoice
exports.updateInvoice = async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    let { invoice_no, invoice_date, customer_id, bank_id, terms_id, subtotal, gst_amount, grand_total, notes, items } = req.body;

    if (!invoice_no || !invoice_date || !customer_id || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: "Required fields are missing." });
    }

    const { filterSql, filterParams } = getTenantFilter(req);
    const companyId = getInsertCompanyId(req);

    const [updateResult] = await connection.query(
      `UPDATE invoices 
       SET invoice_no = ?, invoice_date = ?, customer_id = ?, subtotal = ?, gst_amount = ?, grand_total = ?, notes = ?, bank_id = ?, terms_id = ?
       WHERE id = ? ${filterSql}`,
      [invoice_no.trim(), invoice_date, customer_id, subtotal || 0, gst_amount || 0, grand_total || 0, notes ? notes.trim() : null, bank_id || null, terms_id || null, id, ...filterParams]
    );

    if (updateResult.affectedRows === 0) {
      throw new Error("Invoice not found or permission denied.");
    }

    await connection.query(`DELETE FROM invoice_items WHERE invoice_id = ? ${filterSql}`, [id, ...filterParams]);

    for (const item of items) {
      let { service_name, description, qty, rate, amount, gst_percent, total } = item;
      await connection.query(
        `INSERT INTO invoice_items
         (company_id, invoice_id, service_name, qty, description, rate, amount, gst_percent, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [companyId, id, service_name, qty || 1, description, rate || 0, amount || 0, gst_percent || 0, total || 0]
      );
    }

    await connection.commit();
    res.json({ success: true, message: "Invoice updated successfully" });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Error in updateInvoice:", err);
    res.status(500).json({ success: false, message: "Failed to update invoice: " + err.message });
  } finally {
    if (connection) connection.release();
  }
};