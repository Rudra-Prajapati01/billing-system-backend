const db = require("../config/db");
const { getTenantFilter, requireBusinessAccess, getInsertCompanyId } = require("../utils/tenantHelper");

// ==========================================
// 1. GET: Fetch All Leads
// ==========================================
exports.getLeads = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const { filterSql, filterParams } = getTenantFilter(req);
    const query = `SELECT * FROM leads WHERE 1=1 ${filterSql} ORDER BY created_at DESC`;
    const [results] = await db.query(query, filterParams);
    res.status(200).json(results);
  } catch (err) {
    console.error("Lead Fetch Error:", err);
    res.status(500).json({ error: "Database error while fetching leads", details: err.message });
  }
};

// ==========================================
// 2. POST: Create a New Lead
// ==========================================
exports.addLead = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const { 
      firm_name, contact_no_1, contact_no_2, email, gst_no, 
      address, country, state, city, ref_by, lead_date, interested_product, 
      assign_employee, remarks, status 
    } = req.body;

    const companyId = getInsertCompanyId(req);
    const createdBy = req.user?.id || null;

    if (!firm_name || !contact_no_1 || !ref_by || !lead_date || !interested_product) {
      return res.status(400).json({ 
        error: "Firm Name, Contact No 1, Referred By, Lead Date, and Interested Product are required" 
      });
    }

    const { filterSql, filterParams } = getTenantFilter(req);

    // Generate LED-XXXX format using MAX(lead_no) for specific tenant
    const [rows] = await db.query(`SELECT MAX(lead_no) AS max_no FROM leads WHERE 1=1 ${filterSql}`, filterParams);
    let nextNum = 1;
    if (rows[0] && rows[0].max_no) {
      const match = rows[0].max_no.match(/\d+/);
      if (match) {
        nextNum = parseInt(match[0]) + 1;
      }
    }
    const lead_no = "LED-" + String(nextNum).padStart(4, "0");

    const insertQuery = `
      INSERT INTO leads 
      (lead_no, firm_name, contact_no_1, contact_no_2, email, gst_no, address, country, state, city, 
      ref_by, lead_date, interested_product, assign_employee, remarks, status, company_id, created_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      lead_no, firm_name, contact_no_1, contact_no_2 || null, email || null, gst_no || null, 
      address || null, country || 'India', state || null, city || null, ref_by, lead_date, 
      interested_product, assign_employee || null, remarks || null, status || 'Pending', 
      companyId, createdBy
    ];

    const [result] = await db.query(insertQuery, values);
    
    res.status(201).json({ message: "Lead created successfully", insertId: result.insertId, lead_no });
  } catch (err) {
    console.error("Lead Save Error:", err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: "Lead Number must be unique. Please try again." });
    }
    res.status(500).json({ error: "Database error while creating lead", details: err.message });
  }
};

// ==========================================
// 3. PUT: Update an Existing Lead (Secured)
// ==========================================
exports.updateLead = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const leadId = req.params.id;
    const { filterSql, filterParams } = getTenantFilter(req);

    const { 
      firm_name, contact_no_1, contact_no_2, email, gst_no, 
      address, country, state, city, ref_by, lead_date, interested_product, 
      assign_employee, remarks, status 
    } = req.body;

    const query = `
      UPDATE leads 
      SET firm_name = ?, contact_no_1 = ?, contact_no_2 = ?, email = ?, gst_no = ?, 
          address = ?, country = ?, state = ?, city = ?, ref_by = ?, lead_date = ?, 
          interested_product = ?, assign_employee = ?, remarks = ?, status = ?
      WHERE id = ? ${filterSql}
    `;

    const values = [
      firm_name, contact_no_1, contact_no_2 || null, email || null, gst_no || null, 
      address || null, country || 'India', state || null, city || null, ref_by, lead_date, 
      interested_product, assign_employee || null, remarks || null, status || 'Pending', 
      leadId, ...filterParams
    ];

    const [result] = await db.query(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Lead not found or unauthorized access" });
    }
    res.status(200).json({ message: "Lead updated successfully" });
  } catch (err) {
    console.error("Lead Update Error:", err);
    res.status(500).json({ error: "Database error while updating lead", details: err.message });
  }
};

// ==========================================
// 4. DELETE: Remove a Lead (Secured)
// ==========================================
exports.deleteLead = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const leadId = req.params.id;
    const { filterSql, filterParams } = getTenantFilter(req);

    const query = `DELETE FROM leads WHERE id = ? ${filterSql}`;
    const values = [leadId, ...filterParams];

    const [result] = await db.query(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Lead not found or unauthorized access" });
    }
    res.status(200).json({ message: "Lead deleted successfully" });
  } catch (err) {
    console.error("Lead Delete Error:", err);
    res.status(500).json({ error: "Database error while deleting lead", details: err.message });
  }
};