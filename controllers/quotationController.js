const db = require("../config/db");
const { getTenantFilter, getInsertCompanyId } = require("../utils/tenantHelper");

// Fetch all quotations (ordered by id DESC)
exports.getQuotations = async (req, res) => {
  try {
    const { filterSql, filterParams } = getTenantFilter(req, "q");
    const [rows] = await db.query(`
      SELECT q.*, c.customer_name 
      FROM quotations q 
      LEFT JOIN customers c ON q.customer_id = c.id 
      WHERE 1=1 ${filterSql}
      ORDER BY q.id DESC
    `, filterParams);
    res.json(rows);
  } catch (err) {
    console.error("Error in getQuotations:", err);
    res.status(500).json({ success: false, message: "Failed to fetch quotations: " + err.message });
  }
};

// Generate the next quotation number
exports.getNextQuotationNumber = async (req, res) => {
  try {
    const { filterSql, filterParams } = getTenantFilter(req);
    const [rows] = await db.query(`SELECT MAX(quotation_no) AS max_no FROM quotations WHERE 1=1 ${filterSql}`, filterParams);
    if (!rows[0].max_no) {
      return res.json({ nextNumber: "QTN-0001" });
    }
    const lastNo = rows[0].max_no;
    const match = lastNo.match(/\d+/);
    if (!match) {
      return res.json({ nextNumber: "QTN-0001" });
    }
    const lastNum = parseInt(match[0]);
    const nextNum = lastNum + 1;
    const paddedNum = String(nextNum).padStart(4, "0");
    res.json({ nextNumber: `QTN-${paddedNum}` });
  } catch (err) {
    console.error("Error in getNextQuotationNumber:", err);
    res.status(500).json({ success: false, message: "Failed to generate quotation number." });
  }
};

// Add Quotation (with items in a Transaction)
exports.addQuotation = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    let { quotation_no, quotation_date, customer_id, bank_id, terms_id, notes, items } = req.body;

    if (!quotation_no || !quotation_date || !customer_id || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: "Required fields are missing." });
    }

    const { filterSql, filterParams } = getTenantFilter(req);
    const companyId = getInsertCompanyId(req);

    const [dup] = await connection.query(`SELECT id FROM quotations WHERE quotation_no = ? ${filterSql}`, [quotation_no.trim(), ...filterParams]);
    if (dup.length > 0) {
      return res.status(400).json({ success: false, message: `Quotation number "${quotation_no.trim()}" already exists.` });
    }

    let calculatedSubtotal = 0;
    let calculatedGstAmount = 0;
    const processedItems = [];

    for (const item of items) {
      const qty = parseFloat(item.qty);
      const rate = parseFloat(item.rate);
      const gstPercent = parseFloat(item.gst_percent || 0);

      if (isNaN(qty) || qty <= 0) return res.status(400).json({ success: false, message: "Quantity must be greater than 0." });
      if (isNaN(rate) || rate <= 0) return res.status(400).json({ success: false, message: "Rate must be greater than 0." });
      if (isNaN(gstPercent) || gstPercent < 0) return res.status(400).json({ success: false, message: "GST % must be 0 or greater." });

      const itemAmount = parseFloat((qty * rate).toFixed(2));
      const itemGst = parseFloat((itemAmount * (gstPercent / 100)).toFixed(2));
      const itemTotal = parseFloat((itemAmount + itemGst).toFixed(2));

      calculatedSubtotal += itemAmount;
      calculatedGstAmount += itemGst;

      processedItems.push({
        service_name: (item.service_name || "").trim(),
        description: (item.description || "").trim(),
        qty, rate, amount: itemAmount, gst_percent: gstPercent, total: itemTotal
      });
    }

    const calculatedGrandTotal = parseFloat((calculatedSubtotal + calculatedGstAmount).toFixed(2));

    const [headerResult] = await connection.query(
      `INSERT INTO quotations (company_id, quotation_no, quotation_date, customer_id, subtotal, gst_amount, grand_total, notes, bank_id, terms_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ companyId, quotation_no.trim(), quotation_date, customer_id, calculatedSubtotal, calculatedGstAmount, calculatedGrandTotal, notes ? notes.trim() : null, bank_id || null, terms_id || null ]
    );
    const quotationId = headerResult.insertId;

    for (const item of processedItems) {
      await connection.query(
        `INSERT INTO quotation_items (company_id, quotation_id, service_name, description, qty, rate, amount, gst_percent, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ companyId, quotationId, item.service_name, item.description || null, item.qty, item.rate, item.amount, item.gst_percent, item.total ]
      );
    }

    await connection.commit();
    res.status(201).json({ success: true, message: "Quotation saved successfully", quotationId });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Error in addQuotation:", err);
    res.status(500).json({ success: false, message: "Failed to save quotation: " + err.message });
  } finally {
    if (connection) connection.release();
  }
};

// Update Quotation (NEW FUNCTION FOR EDIT)
exports.updateQuotation = async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    let { quotation_no, quotation_date, customer_id, bank_id, terms_id, notes, items } = req.body;

    if (!quotation_no || !quotation_date || !customer_id || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: "Required fields are missing." });
    }

    let calculatedSubtotal = 0;
    let calculatedGstAmount = 0;
    const processedItems = [];

    for (const item of items) {
      const qty = parseFloat(item.qty);
      const rate = parseFloat(item.rate);
      const gstPercent = parseFloat(item.gst_percent || 0);

      if (isNaN(qty) || qty <= 0) return res.status(400).json({ success: false, message: "Quantity must be greater than 0." });
      if (isNaN(rate) || rate <= 0) return res.status(400).json({ success: false, message: "Rate must be greater than 0." });

      const itemAmount = parseFloat((qty * rate).toFixed(2));
      const itemGst = parseFloat((itemAmount * (gstPercent / 100)).toFixed(2));
      const itemTotal = parseFloat((itemAmount + itemGst).toFixed(2));

      calculatedSubtotal += itemAmount;
      calculatedGstAmount += itemGst;

      processedItems.push({
        service_name: (item.service_name || "").trim(),
        description: (item.description || "").trim(),
        qty, rate, amount: itemAmount, gst_percent: gstPercent, total: itemTotal
      });
    }

    const calculatedGrandTotal = parseFloat((calculatedSubtotal + calculatedGstAmount).toFixed(2));

    const { filterSql, filterParams } = getTenantFilter(req);
    const companyId = getInsertCompanyId(req);

    const [updateResult] = await connection.query(
      `UPDATE quotations SET quotation_no=?, quotation_date=?, customer_id=?, subtotal=?, gst_amount=?, grand_total=?, notes=?, bank_id=?, terms_id=? WHERE id=? ${filterSql}`,
      [ quotation_no.trim(), quotation_date, customer_id, calculatedSubtotal, calculatedGstAmount, calculatedGrandTotal, notes ? notes.trim() : null, bank_id || null, terms_id || null, id, ...filterParams ]
    );
    
    if (updateResult.affectedRows === 0) {
      throw new Error("Quotation not found or permission denied.");
    }

    // Delete old items and insert updated ones
    await connection.query(`DELETE FROM quotation_items WHERE quotation_id = ? ${filterSql}`, [id, ...filterParams]);

    for (const item of processedItems) {
      await connection.query(
        `INSERT INTO quotation_items (company_id, quotation_id, service_name, description, qty, rate, amount, gst_percent, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ companyId, id, item.service_name, item.description || null, item.qty, item.rate, item.amount, item.gst_percent, item.total ]
      );
    }

    await connection.commit();
    res.json({ success: true, message: "Quotation updated successfully" });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Error in updateQuotation:", err);
    res.status(500).json({ success: false, message: "Failed to update quotation: " + err.message });
  } finally {
    if (connection) connection.release();
  }
};

// Delete Quotation
exports.deleteQuotation = async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    const { filterSql, filterParams } = getTenantFilter(req);
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [exists] = await connection.query(`SELECT id FROM quotations WHERE id = ? ${filterSql}`, [id, ...filterParams]);
    if (exists.length === 0) return res.status(404).json({ success: false, message: "Quotation not found." });

    await connection.query(`DELETE FROM quotations WHERE id = ? ${filterSql}`, [id, ...filterParams]);
    await connection.commit();
    res.json({ success: true, message: "Quotation deleted successfully" });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Error in deleteQuotation:", err);
    res.status(500).json({ success: false, message: "Failed to delete quotation: " + err.message });
  } finally {
    if (connection) connection.release();
  }
};

// Fetch quotation details with items (Updated to fetch header)
exports.getQuotationById = async (req, res) => {
  const { id } = req.params;
  try {
    const { filterSql, filterParams } = getTenantFilter(req);
    const [headerResult] = await db.query(`SELECT * FROM quotations WHERE id = ? ${filterSql}`, [id, ...filterParams]);
    if (headerResult.length === 0) return res.status(404).json({ success: false, message: "Quotation not found." });

    const header = headerResult[0];
    const [items] = await db.query(`SELECT * FROM quotation_items WHERE quotation_id = ? ${filterSql}`, [id, ...filterParams]);
    
    const [companyResult] = await db.query(
      `SELECT * FROM company_profile WHERE company_id = ? LIMIT 1`,
      [header.company_id]
    );
    const companyInfo = companyResult[0] || null;

    res.json({ success: true, header, items, companyInfo });
  } catch (err) {
    console.error("Error in getQuotationById:", err);
    res.status(500).json({ success: false, message: "Failed to fetch quotation details: " + err.message });
  }
};