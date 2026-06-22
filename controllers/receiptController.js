const db = require("../config/db"); // Adjust path to your DB connection file
const { getTenantFilter } = require("../utils/tenantHelper");

// Fetch all receipts
exports.getAllReceipts = async (req, res) => {
  try {
    const { filterSql, filterParams } = getTenantFilter(req, "r");
    const query = `
      SELECT 
        r.id, 
        r.receipt_no, 
        r.receipt_date, 
        i.invoice_no, 
        c.customer_name, 
        r.amount 
      FROM receipts r
      JOIN payments p ON r.payment_id = p.id
      JOIN invoices i ON p.invoice_id = i.id
      JOIN customers c ON i.customer_id = c.id
      WHERE 1=1 ${filterSql}
      ORDER BY r.id DESC
    `;
    const [receipts] = await db.query(query, filterParams);
    res.status(200).json(receipts);
  } catch (error) {
    console.error("Error fetching receipts:", error);
    res.status(500).json({ success: false, message: "Server error while fetching receipts." });
  }
};

// Generate Next Receipt Number
exports.getNextReceiptNumber = async (req, res) => {
  try {
    const { filterSql, filterParams } = getTenantFilter(req);
    const query = `SELECT MAX(receipt_no) AS max_no FROM receipts WHERE 1=1 ${filterSql}`;
    const [rows] = await db.query(query, filterParams);

    let nextNumber = "RCP-0001";

    if (rows[0] && rows[0].max_no) {
      const lastReceiptNo = rows[0].max_no;
      const numericPart = parseInt(lastReceiptNo.split("-")[1], 10);
      const incrementedNumber = numericPart + 1;
      nextNumber = `RCP-${String(incrementedNumber).padStart(4, "0")}`;
    }

    res.status(200).json({ success: true, next_number: nextNumber });
  } catch (error) {
    console.error("Error generating receipt number:", error);
    res.status(500).json({ success: false, message: "Server error while generating receipt number." });
  }
};

// Create a new receipt
exports.createReceipt = async (req, res) => {
  try {
    const { payment_id, receipt_date } = req.body;

    if (!payment_id || !receipt_date) {
      return res.status(400).json({ success: false, message: "Payment ID and Receipt Date are required." });
    }

    const { filterSql, filterParams } = getTenantFilter(req);

    // 1. Validate payment exists and fetch amount
    const [paymentRows] = await db.query(`SELECT amount, company_id FROM payments WHERE id = ? ${filterSql}`, [payment_id, ...filterParams]);
    
    if (paymentRows.length === 0) {
      return res.status(404).json({ success: false, message: "Payment record not found." });
    }

    const amount = paymentRows[0].amount;
    const parentCompanyId = paymentRows[0].company_id;

    // 2. Generate Receipt Number automatically
    const [lastReceipt] = await db.query(`SELECT MAX(receipt_no) AS max_no FROM receipts WHERE 1=1 ${filterSql}`, filterParams);
    let receipt_no = "RCP-0001";
    if (lastReceipt[0] && lastReceipt[0].max_no) {
      const numericPart = parseInt(lastReceipt[0].max_no.split("-")[1], 10);
      receipt_no = `RCP-${String(numericPart + 1).padStart(4, "0")}`;
    }

    // 3. Insert Receipt into database
    const insertQuery = `
      INSERT INTO receipts (company_id, receipt_no, payment_id, receipt_date, amount) 
      VALUES (?, ?, ?, ?, ?)
    `;
    const [result] = await db.query(insertQuery, [parentCompanyId, receipt_no, payment_id, receipt_date, amount]);

    res.status(201).json({ 
      success: true, 
      message: "Receipt created successfully", 
      receiptId: result.insertId,
      receipt_no: receipt_no 
    });
  } catch (error) {
    console.error("Error creating receipt:", error);
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ success: false, message: "A receipt for this transaction or number already exists." });
    }
    res.status(500).json({ success: false, message: "Server error while creating receipt." });
  }
};

// Get Single Receipt by ID
exports.getReceiptById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, message: "Valid Receipt ID is required." });
    }

    const { filterSql, filterParams } = getTenantFilter(req, "r");

    const query = `
      SELECT 
        r.id,
        r.receipt_no, 
        r.receipt_date, 
        i.invoice_no, 
        c.customer_name, 
        r.amount, 
        p.payment_mode, 
        p.transaction_ref, 
        p.remarks 
      FROM receipts r
      JOIN payments p ON r.payment_id = p.id
      JOIN invoices i ON p.invoice_id = i.id
      JOIN customers c ON i.customer_id = c.id
      WHERE r.id = ? ${filterSql}
    `;

    const [rows] = await db.query(query, [id, ...filterParams]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Receipt not found." });
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Error fetching single receipt:", error);
    res.status(500).json({ success: false, message: "Server error while fetching receipt details." });
  }
};

// Delete a receipt
exports.deleteReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, message: "Valid Receipt ID is required." });
    }

    const { filterSql, filterParams } = getTenantFilter(req);
    const [result] = await db.query(`DELETE FROM receipts WHERE id = ? ${filterSql}`, [id, ...filterParams]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Receipt not found." });
    }

    res.status(200).json({ success: true, message: "Receipt deleted successfully." });
  } catch (error) {
    console.error("Error deleting receipt:", error);
    res.status(500).json({ success: false, message: "Server error while deleting receipt." });
  }
};