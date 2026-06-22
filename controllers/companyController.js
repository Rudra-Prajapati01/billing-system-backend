const db = require("../config/db");
const { getTenantFilter, getInsertCompanyId } = require("../utils/tenantHelper");

// Fetch company profile and list of banks
exports.getCompanyProfile = async (req, res) => {
  try {
    const { filterSql, filterParams } = getTenantFilter(req);
    const [profileRows] = await db.query(`SELECT * FROM company_profile WHERE 1=1 ${filterSql} LIMIT 1`, filterParams);
    const [bankRows] = await db.query(`SELECT id, bank_name, account_holder_name, account_number, branch_name FROM banks WHERE 1=1 ${filterSql} ORDER BY id ASC`, filterParams);
    
    res.json({
      profile: profileRows[0] || null,
      banks: bankRows
    });
  } catch (err) {
    console.error("Error in getCompanyProfile:", err);
    res.status(500).json({ error: "Failed to fetch company profile", details: err.message });
  }
};

// Create company profile (Enforces single record constraint per company)
exports.createCompanyProfile = async (req, res) => {
  try {
    const { filterSql, filterParams } = getTenantFilter(req);
    const companyId = getInsertCompanyId(req);

    // Enforce single record constraint per company: if one exists, update it instead
    const [existingRows] = await db.query(`SELECT id FROM company_profile WHERE 1=1 ${filterSql} LIMIT 1`, filterParams);
    if (existingRows.length > 0) {
      req.params.id = existingRows[0].id;
      return exports.updateCompanyProfile(req, res);
    }

    const {
      company_name,
      owner_name,
      gst_number,
      legal_name,
      pan_number,
      email,
      website,
      address,
      city,
      state,
      pincode,
      contact_no_1,
      contact_no_2,
      bank_id,
      show_contact1_bill,
      show_contact2_bill,
      show_email_bill,
      show_website_bill
    } = req.body;

    if (!company_name) {
      return res.status(400).json({ error: "Company Name is required" });
    }

    // Extract file paths from multer uploads
    const logoPath = req.files?.logo?.[0] ? `/uploads/${req.files.logo[0].filename}` : null;
    const signaturePath = req.files?.signature?.[0] ? `/uploads/${req.files.signature[0].filename}` : null;

    const [result] = await db.query(
      `INSERT INTO company_profile (
        company_id, company_name, owner_name, gst_number, legal_name,
        pan_number, email, website, address, city, state, pincode, contact_no_1, contact_no_2,
        logo, signature, bank_id, show_contact1_bill, show_contact2_bill, show_email_bill, show_website_bill
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        company_name.trim(),
        owner_name ? owner_name.trim() : null,
        gst_number ? gst_number.trim() : null,
        legal_name ? legal_name.trim() : null,
        pan_number ? pan_number.trim() : null,
        email ? email.trim() : null,
        website ? website.trim() : null,
        address ? address.trim() : null,
        city ? city.trim() : null,
        state ? state.trim() : null,
        pincode ? pincode.trim() : null,
        contact_no_1 ? contact_no_1.trim() : null,
        contact_no_2 ? contact_no_2.trim() : null,
        logoPath,
        signaturePath,
        bank_id ? parseInt(bank_id) : null,
        show_contact1_bill === "true" || show_contact1_bill === true || show_contact1_bill === 1 ? 1 : 0,
        show_contact2_bill === "true" || show_contact2_bill === true || show_contact2_bill === 1 ? 1 : 0,
        show_email_bill === "true" || show_email_bill === true || show_email_bill === 1 ? 1 : 0,
        show_website_bill === "true" || show_website_bill === true || show_website_bill === 1 ? 1 : 0
      ]
    );

    res.status(201).json({
      success: true,
      message: "Company Profile Created Successfully",
      profileId: result.insertId
    });
  } catch (err) {
    console.error("Error in createCompanyProfile:", err);
    res.status(500).json({ error: "Failed to create company profile", details: err.message });
  }
};

// Update company profile
exports.updateCompanyProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      company_name,
      owner_name,
      gst_number,
      legal_name,
      pan_number,
      email,
      website,
      address,
      city,
      state,
      pincode,
      contact_no_1,
      contact_no_2,
      bank_id,
      show_contact1_bill,
      show_contact2_bill,
      show_email_bill,
      show_website_bill
    } = req.body;

    if (!company_name) {
      return res.status(400).json({ error: "Company Name is required" });
    }

    const { filterSql, filterParams } = getTenantFilter(req);

    // Retrieve existing image paths from database to retain them if no new files are uploaded
    const [existing] = await db.query(`SELECT logo, signature FROM company_profile WHERE id = ? ${filterSql}`, [id, ...filterParams]);
    if (existing.length === 0) {
      return res.status(404).json({ error: "Company Profile record not found or access denied" });
    }

    // Multer uploads
    const logoPath = req.files?.logo?.[0] ? `/uploads/${req.files.logo[0].filename}` : existing[0].logo;
    const signaturePath = req.files?.signature?.[0] ? `/uploads/${req.files.signature[0].filename}` : existing[0].signature;

    await db.query(
      `UPDATE company_profile SET
        company_name = ?,
        owner_name = ?,
        gst_number = ?,
        legal_name = ?,
        pan_number = ?,
        email = ?,
        website = ?,
        address = ?,
        city = ?,
        state = ?,
        pincode = ?,
        contact_no_1 = ?,
        contact_no_2 = ?,
        logo = ?,
        signature = ?,
        bank_id = ?,
        show_contact1_bill = ?,
        show_contact2_bill = ?,
        show_email_bill = ?,
        show_website_bill = ?
      WHERE id = ? ${filterSql}`,
      [
        company_name.trim(),
        owner_name ? owner_name.trim() : null,
        gst_number ? gst_number.trim() : null,
        legal_name ? legal_name.trim() : null,
        pan_number ? pan_number.trim() : null,
        email ? email.trim() : null,
        website ? website.trim() : null,
        address ? address.trim() : null,
        city ? city.trim() : null,
        state ? state.trim() : null,
        pincode ? pincode.trim() : null,
        contact_no_1 ? contact_no_1.trim() : null,
        contact_no_2 ? contact_no_2.trim() : null,
        logoPath,
        signaturePath,
        bank_id ? parseInt(bank_id) : null,
        show_contact1_bill === "true" || show_contact1_bill === true || show_contact1_bill === 1 ? 1 : 0,
        show_contact2_bill === "true" || show_contact2_bill === true || show_contact2_bill === 1 ? 1 : 0,
        show_email_bill === "true" || show_email_bill === true || show_email_bill === 1 ? 1 : 0,
        show_website_bill === "true" || show_website_bill === true || show_website_bill === 1 ? 1 : 0,
        id,
        ...filterParams
      ]
    );

    res.json({
      success: true,
      message: "Company Profile Updated Successfully"
    });
  } catch (err) {
    console.error("Error in updateCompanyProfile:", err);
    res.status(500).json({ error: "Failed to update company profile", details: err.message });
  }
};
