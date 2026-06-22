const db = require("../config/db");

// @desc    Get all tenant companies
// @route   GET /api/tenant-companies
// @access  Private (SuperAdmin only)
exports.getCompanies = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM companies ORDER BY id DESC");
    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("getCompanies error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch companies: " + error.message,
    });
  }
};

// @desc    Create a tenant company
// @route   POST /api/tenant-companies
// @access  Private (SuperAdmin only)
exports.createCompany = async (req, res) => {
  try {
    const { company_name, company_code, contact_person, email, mobile, address, status } = req.body;

    // 1. Validation
    if (!company_name || !company_code) {
      return res.status(400).json({
        success: false,
        message: "Company Name and Company Code are required.",
      });
    }

    const code = company_code.trim().toUpperCase();

    // 2. Validate uniqueness of company_code
    const [existing] = await db.query("SELECT id FROM companies WHERE company_code = ?", [code]);
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Company code "${code}" is already in use. Please select a unique code.`,
      });
    }

    // 3. Save to database
    const [result] = await db.query(
      `INSERT INTO companies (company_name, company_code, contact_person, email, mobile, address, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        company_name.trim(),
        code,
        contact_person ? contact_person.trim() : null,
        email ? email.trim() : null,
        mobile ? mobile.trim() : null,
        address ? address.trim() : null,
        status || "Active",
      ]
    );

    res.status(201).json({
      success: true,
      message: "Company created successfully.",
      company: {
        id: result.insertId,
        company_name,
        company_code: code,
        status: status || "Active",
      },
    });
  } catch (error) {
    console.error("createCompany error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create company: " + error.message,
    });
  }
};

// @desc    Update a tenant company (Enforces deactivation protection)
// @route   PUT /api/tenant-companies/:id
// @access  Private (SuperAdmin only)
exports.updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_name, company_code, contact_person, email, mobile, address, status } = req.body;

    // 1. Check if company exists
    const [existingComp] = await db.query("SELECT id, status FROM companies WHERE id = ?", [id]);
    if (existingComp.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Company not found.",
      });
    }

    const currentCompany = existingComp[0];

    // 2. Validation
    if (!company_name || !company_code) {
      return res.status(400).json({
        success: false,
        message: "Company Name and Company Code are required.",
      });
    }

    const code = company_code.trim().toUpperCase();

    // 3. Validate uniqueness of company_code
    const [existingCode] = await db.query(
      "SELECT id FROM companies WHERE company_code = ? AND id != ?",
      [code, id]
    );
    if (existingCode.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Company code "${code}" is already in use by another company.`,
      });
    }

    // 4. Deactivation protection guard (if changing status from Active to Inactive)
    if (currentCompany.status === "Active" && status === "Inactive") {
      // a. Active Users count
      const [[userCountRes]] = await db.query(
        "SELECT COUNT(id) AS count FROM users WHERE company_id = ? AND status = 'Active'",
        [id]
      );
      // b. Customers count
      const [[customerCountRes]] = await db.query(
        "SELECT COUNT(id) AS count FROM customers WHERE company_id = ?",
        [id]
      );
      // c. Quotations count
      const [[quotationCountRes]] = await db.query(
        "SELECT COUNT(id) AS count FROM quotations WHERE company_id = ?",
        [id]
      );
      // d. Invoices count
      const [[invoiceCountRes]] = await db.query(
        "SELECT COUNT(id) AS count FROM invoices WHERE company_id = ?",
        [id]
      );
      // e. Payments count
      const [[paymentCountRes]] = await db.query(
        "SELECT COUNT(id) AS count FROM payments WHERE company_id = ?",
        [id]
      );

      const hasAssociatedData = 
        userCountRes.count > 0 ||
        customerCountRes.count > 0 ||
        quotationCountRes.count > 0 ||
        invoiceCountRes.count > 0 ||
        paymentCountRes.count > 0;

      if (hasAssociatedData) {
        return res.status(400).json({
          success: false,
          message: "Company contains active users or billing data and cannot be deactivated.",
        });
      }
    }

    // 5. Perform update
    await db.query(
      `UPDATE companies 
       SET company_name = ?, company_code = ?, contact_person = ?, email = ?, mobile = ?, address = ?, status = ? 
       WHERE id = ?`,
      [
        company_name.trim(),
        code,
        contact_person ? contact_person.trim() : null,
        email ? email.trim() : null,
        mobile ? mobile.trim() : null,
        address ? address.trim() : null,
        status,
        id,
      ]
    );

    res.json({
      success: true,
      message: "Company details updated successfully.",
    });
  } catch (error) {
    console.error("updateCompany error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update company: " + error.message,
    });
  }
};

// @desc    Assign CompanyAdmin user to a company
// @route   POST /api/tenant-companies/:id/assign-admin
// @access  Private (SuperAdmin only)
exports.assignAdmin = async (req, res) => {
  try {
    const { id } = req.params; // Company ID
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required.",
      });
    }

    // Check if company exists
    const [company] = await db.query("SELECT id, status FROM companies WHERE id = ?", [id]);
    if (company.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Company not found.",
      });
    }

    if (company[0].status !== "Active") {
      return res.status(400).json({
        success: false,
        message: "Cannot assign administrator to an inactive company.",
      });
    }

    // Check if user exists
    const [user] = await db.query("SELECT id, role FROM users WHERE id = ?", [user_id]);
    if (user.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Update user role and map company
    await db.query(
      "UPDATE users SET company_id = ?, role = 'CompanyAdmin' WHERE id = ?",
      [id, user_id]
    );

    res.json({
      success: true,
      message: "Administrator assigned successfully.",
    });
  } catch (error) {
    console.error("assignAdmin error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to assign administrator: " + error.message,
    });
  }
};
