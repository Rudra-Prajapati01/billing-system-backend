const db = require("../config/db");
const { getTenantFilter, requireBusinessAccess, getInsertCompanyId } = require("../utils/tenantHelper");

// Get all banks (ordered by id DESC)
exports.getBanks = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const { filterSql, filterParams } = getTenantFilter(req);
    const [rows] = await db.query(`SELECT * FROM banks WHERE 1=1 ${filterSql} ORDER BY id DESC`, filterParams);
    res.json(rows);
  } catch (err) {
    console.error("Error in getBanks:", err);
    res.status(500).json({ success: false, message: "Failed to fetch bank accounts: " + err.message });
  }
};

// Add Bank Account
exports.addBank = async (req, res) => {
  requireBusinessAccess(req);
  try {
    let { bank_name, account_holder_name, account_number, ifsc_code, branch_name } = req.body;

    // 1. Trim input values
    bank_name = bank_name ? bank_name.trim() : "";
    account_holder_name = account_holder_name ? account_holder_name.trim() : "";
    account_number = account_number ? account_number.trim() : "";
    ifsc_code = ifsc_code ? ifsc_code.trim().toUpperCase() : "";
    branch_name = branch_name ? branch_name.trim() : null;

    // 2. Validate required fields
    if (!bank_name || !account_holder_name || !account_number || !ifsc_code) {
      return res.status(400).json({ success: false, message: "Required fields are missing." });
    }

    // 3. Validation: Account number only numbers
    if (!/^\d+$/.test(account_number)) {
      return res.status(400).json({ success: false, message: "Account number must contain only digits." });
    }

    // 4. Soft validations: Account number min 6 digits, IFSC exactly 11 characters
    if (account_number.length < 6) {
      return res.status(400).json({ success: false, message: "Account number must be at least 6 digits." });
    }
    if (ifsc_code.length !== 11) {
      return res.status(400).json({ success: false, message: "IFSC code must be exactly 11 characters." });
    }

    // 5. Unique bank_name + account_number combination check
    const { filterSql, filterParams } = getTenantFilter(req);
    const companyId = getInsertCompanyId(req);

    const [existing] = await db.query(
      `SELECT id FROM banks WHERE bank_name = ? AND account_number = ? ${filterSql}`,
      [bank_name, account_number, ...filterParams]
    );
    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "A bank account with this Bank Name and Account Number already exists." 
      });
    }

    // 6. Save to database
    const [result] = await db.query(
      `INSERT INTO banks (company_id, bank_name, account_holder_name, account_number, ifsc_code, branch_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [companyId, bank_name, account_holder_name, account_number, ifsc_code, branch_name]
    );

    res.status(201).json({
      success: true,
      message: "Bank saved successfully",
      bankId: result.insertId
    });
  } catch (err) {
    console.error("Error in addBank:", err);
    res.status(500).json({ success: false, message: "Failed to save bank account: " + err.message });
  }
};

// Update Bank Account
exports.updateBank = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const { id } = req.params;
    let { bank_name, account_holder_name, account_number, ifsc_code, branch_name } = req.body;

    // 1. Trim input values
    bank_name = bank_name ? bank_name.trim() : "";
    account_holder_name = account_holder_name ? account_holder_name.trim() : "";
    account_number = account_number ? account_number.trim() : "";
    ifsc_code = ifsc_code ? ifsc_code.trim().toUpperCase() : "";
    branch_name = branch_name ? branch_name.trim() : null;

    // 2. Validate required fields
    if (!bank_name || !account_holder_name || !account_number || !ifsc_code) {
      return res.status(400).json({ success: false, message: "Required fields are missing." });
    }

    // 3. Validation: Account number only numbers
    if (!/^\d+$/.test(account_number)) {
      return res.status(400).json({ success: false, message: "Account number must contain only digits." });
    }

    // 4. Soft validations: Account number min 6 digits, IFSC exactly 11 characters
    if (account_number.length < 6) {
      return res.status(400).json({ success: false, message: "Account number must be at least 6 digits." });
    }
    if (ifsc_code.length !== 11) {
      return res.status(400).json({ success: false, message: "IFSC code must be exactly 11 characters." });
    }

    // 5. Unique check: ignore the current record being edited
    const { filterSql, filterParams } = getTenantFilter(req);

    const [existing] = await db.query(
      `SELECT id FROM banks WHERE bank_name = ? AND account_number = ? AND id != ? ${filterSql}`,
      [bank_name, account_number, id, ...filterParams]
    );
    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "A bank account with this Bank Name and Account Number already exists." 
      });
    }

    // 6. Update database record
    const [result] = await db.query(
      `UPDATE banks SET bank_name = ?, account_holder_name = ?, account_number = ?, ifsc_code = ?, branch_name = ?
       WHERE id = ? ${filterSql}`,
      [bank_name, account_holder_name, account_number, ifsc_code, branch_name, id, ...filterParams]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Bank account not found." });
    }

    res.json({
      success: true,
      message: "Bank saved successfully"
    });
  } catch (err) {
    console.error("Error in updateBank:", err);
    res.status(500).json({ success: false, message: "Failed to update bank account: " + err.message });
  }
};

// Delete Bank Account
exports.deleteBank = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const { id } = req.params;

    // 1. Linked deletion prevention check
    const { filterSql, filterParams } = getTenantFilter(req);

    const [linked] = await db.query(
      `SELECT id FROM company_profile WHERE bank_id = ? LIMIT 1`,
      [id]
    );
    if (linked.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "This bank is linked with Company Profile and cannot be deleted." 
      });
    }

    // 2. Perform deletion
    const [result] = await db.query(`DELETE FROM banks WHERE id = ? ${filterSql}`, [id, ...filterParams]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Bank account not found." });
    }

    res.json({
      success: true,
      message: "Bank deleted successfully"
    });
  } catch (err) {
    console.error("Error in deleteBank:", err);
    res.status(500).json({ success: false, message: "Failed to delete bank account: " + err.message });
  }
};
