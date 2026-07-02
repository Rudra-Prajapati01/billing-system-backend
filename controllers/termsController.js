const db = require("../config/db");
const { getTenantFilter, requireBusinessAccess, getInsertCompanyId } = require("../utils/tenantHelper");

// Get all terms (ordered by id DESC)
exports.getTerms = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const { filterSql, filterParams } = getTenantFilter(req);
    const [rows] = await db.query(`SELECT * FROM terms_conditions WHERE 1=1 ${filterSql} ORDER BY id DESC`, filterParams);
    res.json(rows);
  } catch (err) {
    console.error("Error in getTerms:", err);
    res.status(500).json({ success: false, message: "Failed to fetch terms: " + err.message });
  }
};

// Add Terms & Conditions
exports.addTerms = async (req, res) => {
  requireBusinessAccess(req);
  try {
    let { title, description, status, is_default } = req.body;

    // 1. Trim input values (keeping internal line breaks in description)
    title = title ? title.trim() : "";
    description = description ? description.trim() : "";
    status = status ? status.trim() : "Active";
    is_default = is_default === true || is_default === "true" || is_default === 1;

    // 2. Validate required fields
    if (!title || !description) {
      return res.status(400).json({ success: false, message: "Title and Description are required." });
    }

    // 3. Unique title check
    const { filterSql, filterParams } = getTenantFilter(req);
    const companyId = getInsertCompanyId(req);

    const [existing] = await db.query(
      `SELECT id FROM terms_conditions WHERE title = ? ${filterSql}`,
      [title, ...filterParams]
    );
    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `A terms profile with the title "${title}" already exists.` 
      });
    }

    // 4. If this is default, reset others
    if (is_default) {
      await db.query(
        `UPDATE terms_conditions SET is_default = FALSE WHERE 1=1 ${filterSql}`,
        [...filterParams]
      );
    }

    // 5. Save to database
    const [result] = await db.query(
      "INSERT INTO terms_conditions (company_id, title, description, status, is_default) VALUES (?, ?, ?, ?, ?)",
      [companyId, title, description, status, is_default]
    );

    res.status(201).json({
      success: true,
      message: "Terms saved successfully",
      termsId: result.insertId
    });
  } catch (err) {
    console.error("Error in addTerms:", err);
    res.status(500).json({ success: false, message: "Failed to save terms: " + err.message });
  }
};

// Update Terms & Conditions
exports.updateTerms = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const { id } = req.params;
    let { title, description, status, is_default } = req.body;

    // 1. Trim input values (keeping internal line breaks in description)
    title = title ? title.trim() : "";
    description = description ? description.trim() : "";
    status = status ? status.trim() : "Active";
    is_default = is_default === true || is_default === "true" || is_default === 1;

    // 2. Validate required fields
    if (!title || !description) {
      return res.status(400).json({ success: false, message: "Title and Description are required." });
    }

    // 3. Unique title check (ignoring the current record)
    const { filterSql, filterParams } = getTenantFilter(req);

    const [existing] = await db.query(
      `SELECT id FROM terms_conditions WHERE title = ? AND id != ? ${filterSql}`,
      [title, id, ...filterParams]
    );
    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `A terms profile with the title "${title}" already exists.` 
      });
    }

    // 4. If this is default, reset others
    if (is_default) {
      await db.query(
        `UPDATE terms_conditions SET is_default = FALSE WHERE 1=1 ${filterSql}`,
        [...filterParams]
      );
    }

    // 5. Update in database
    const [result] = await db.query(
      `UPDATE terms_conditions SET title = ?, description = ?, status = ?, is_default = ? WHERE id = ? ${filterSql}`,
      [title, description, status, is_default, id, ...filterParams]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Terms not found." });
    }

    res.json({
      success: true,
      message: "Terms saved successfully"
    });
  } catch (err) {
    console.error("Error in updateTerms:", err);
    res.status(500).json({ success: false, message: "Failed to update terms: " + err.message });
  }
};

// Delete Terms & Conditions
exports.deleteTerms = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const { id } = req.params;

    // Do NOT implement terms usage checks yet (as instructed)
    const { filterSql, filterParams } = getTenantFilter(req);
    const [result] = await db.query(`DELETE FROM terms_conditions WHERE id = ? ${filterSql}`, [id, ...filterParams]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Terms not found." });
    }

    res.json({
      success: true,
      message: "Terms deleted successfully"
    });
  } catch (err) {
    console.error("Error in deleteTerms:", err);
    res.status(500).json({ success: false, message: "Failed to delete terms: " + err.message });
  }
};
