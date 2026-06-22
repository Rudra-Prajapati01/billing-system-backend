const db = require("../config/db");
const { getTenantFilter } = require("../utils/tenantHelper");

// 1. Get Customer Dropdown List
exports.getCustomers = async (req, res) => {
  try {
    const { filterSql, filterParams } = getTenantFilter(req);
    const query = `SELECT id, customer_name, company_name FROM customers WHERE 1=1 ${filterSql} ORDER BY company_name ASC`;
    const [customers] = await db.query(query, filterParams);
    res.status(200).json(customers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ success: false, message: "Server error while fetching customers." });
  }
};

// 2. Get Customer Summary Stats
exports.getSummary = async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!customerId) return res.status(400).json({ success: false, message: "Customer ID required." });

    const { filterSql, filterParams } = getTenantFilter(req);

    // Quotations Count
    const [[quoteRes]] = await db.query(`SELECT COUNT(id) as count FROM quotations WHERE customer_id = ? ${filterSql}`, [customerId, ...filterParams]);
    
    // Invoices Count & Total Amount
    const [[invoiceRes]] = await db.query(`
      SELECT COUNT(id) as count, COALESCE(SUM(grand_total), 0) as total_amount 
      FROM invoices WHERE customer_id = ? ${filterSql}
    `, [customerId, ...filterParams]);

    // Total Paid
    const { filterSql: pFilterSql, filterParams: pFilterParams } = getTenantFilter(req, "i");
    const [[paymentRes]] = await db.query(`
      SELECT COALESCE(SUM(p.amount), 0) as paid 
      FROM payments p 
      JOIN invoices i ON p.invoice_id = i.id 
      WHERE i.customer_id = ? ${pFilterSql}
    `, [customerId, ...pFilterParams]);

    const totalInvoiceAmount = parseFloat(invoiceRes.total_amount);
    const totalPaid = parseFloat(paymentRes.paid);
    const outstanding = totalInvoiceAmount - totalPaid;

    res.status(200).json({
      quotation_count: quoteRes.count,
      invoice_count: invoiceRes.count,
      total_invoice_amount: totalInvoiceAmount,
      total_paid: totalPaid,
      outstanding: outstanding
    });

  } catch (error) {
    console.error("Error fetching summary:", error);
    res.status(500).json({ success: false, message: "Server error while fetching summary." });
  }
};

// 3. Get Combined Ledger
exports.getLedger = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { fromDate, toDate } = req.query;

    if (!customerId) return res.status(400).json({ success: false, message: "Customer ID required." });

    let openingBalance = 0;

    const { filterSql, filterParams } = getTenantFilter(req);
    const { filterSql: iFilterSql, filterParams: iFilterParams } = getTenantFilter(req, "i");

    // If fromDate exists, calculate the Opening Balance (Prior Invoices - Prior Payments)
    if (fromDate) {
      const [[priorInvoices]] = await db.query(`SELECT COALESCE(SUM(grand_total), 0) as amount FROM invoices WHERE customer_id = ? AND invoice_date < ? ${filterSql}`, [customerId, fromDate, ...filterParams]);
      const [[priorPayments]] = await db.query(`
        SELECT COALESCE(SUM(p.amount), 0) as amount 
        FROM payments p JOIN invoices i ON p.invoice_id = i.id 
        WHERE i.customer_id = ? AND p.payment_date < ? ${iFilterSql}
      `, [customerId, fromDate, ...iFilterParams]);
      openingBalance = parseFloat(priorInvoices.amount) - parseFloat(priorPayments.amount);
    }

    // Dynamic filtering for the main ledger query
    let invConditions = `WHERE customer_id = ? ${filterSql}`;
    let payConditions = `WHERE i.customer_id = ? ${iFilterSql}`;
    const queryParamsInv = [customerId, ...filterParams];
    const queryParamsPay = [customerId, ...iFilterParams];

    if (fromDate) {
      invConditions += " AND invoice_date >= ?";
      payConditions += " AND p.payment_date >= ?";
      queryParamsInv.push(fromDate);
      queryParamsPay.push(fromDate);
    }
    if (toDate) {
      invConditions += " AND invoice_date <= ?";
      payConditions += " AND p.payment_date <= ?";
      queryParamsInv.push(toDate);
      queryParamsPay.push(toDate);
    }

    const fullParams = [...queryParamsInv, ...queryParamsPay];

    // UPDATED: Added LPAD for proper payment numbers & updated ORDER BY logic
    const query = `
      SELECT invoice_date AS date, 'Invoice' AS type, invoice_no AS number, grand_total AS debit, 0 AS credit 
      FROM invoices ${invConditions}
      UNION ALL
      SELECT p.payment_date AS date, 'Payment' AS type, CONCAT('PAY-', LPAD(p.id, 4, '0')) AS number, 0 AS debit, p.amount AS credit 
      FROM payments p JOIN invoices i ON p.invoice_id = i.id ${payConditions}
      ORDER BY date ASC, 
        CASE 
          WHEN type='Invoice' THEN 1 
          WHEN type='Payment' THEN 2 
        END
    `;

    const [rows] = await db.query(query, fullParams);

    // Calculate Running Balance
    let currentBalance = openingBalance;
    const ledger = rows.map(row => {
      currentBalance += (parseFloat(row.debit) - parseFloat(row.credit));
      return {
        ...row,
        debit: parseFloat(row.debit),
        credit: parseFloat(row.credit),
        balance: currentBalance
      };
    });

    // Frontend Helper Variables for Professional Accounting Display
    const isCredit = openingBalance < 0;
    const absoluteOpeningBalance = Math.abs(openingBalance);

    res.status(200).json({ 
      openingBalance, 
      isCredit, 
      absoluteOpeningBalance, 
      ledger 
    });

  } catch (error) {
    console.error("Error fetching ledger:", error);
    res.status(500).json({ success: false, message: "Server error while fetching ledger." });
  }
};