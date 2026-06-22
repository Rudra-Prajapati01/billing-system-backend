const bcrypt = require("bcryptjs");
const db = require("../config/db");

// @desc    Get all users (paginated, searchable, sorted latest first)
// @route   GET /api/users
// @access  Private (SuperAdmin only)
exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";

    let queryParams = [];
    let whereClause = "";

    // Security: Non-SuperAdmins can only see users of their own company
    if (req.user.role !== "SuperAdmin") {
      whereClause = "WHERE u.company_id = ?";
      queryParams.push(req.user.company_id);
      if (search) {
        whereClause += " AND (u.name LIKE ? OR u.username LIKE ?)";
        queryParams.push(`%${search}%`, `%${search}%`);
      }
    } else {
      if (search) {
        whereClause = "WHERE u.name LIKE ? OR u.username LIKE ?";
        queryParams.push(`%${search}%`, `%${search}%`);
      }
    }

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) AS total 
      FROM users u 
      ${whereClause}
    `;
    const [countResult] = await db.query(countQuery, queryParams);
    const total = countResult[0].total;

    // Get paginated users ordered by latest first, excluding passwords, with company name
    const selectQuery = `
      SELECT u.id, u.name, u.username, u.role, u.status, u.company_id, c.company_name, u.created_at, u.updated_at 
      FROM users u
      LEFT JOIN companies c ON u.company_id = c.id
      ${whereClause} 
      ORDER BY u.id DESC 
      LIMIT ? OFFSET ?
    `;
    
    // We add limit and offset to query parameters
    queryParams.push(limit, offset);
    const [rows] = await db.query(selectQuery, queryParams);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error("getUsers controller error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users: " + error.message,
    });
  }
};

// @desc    Create a user
// @route   POST /api/users
// @access  Private (SuperAdmin only)
exports.createUser = async (req, res) => {
  try {
    const { name, username, password, role, status, company_id } = req.body;

    // 1. Validation
    if (!name || !username || !password || !role || !status) {
      return res.status(400).json({
        success: false,
        message: "All fields (name, username, password, role, status) are required.",
      });
    }

    const trimmedUsername = username.trim().toLowerCase();

    // 2. Validate role enum
    if (!["SuperAdmin", "CompanyAdmin", "Staff"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Allowed values: SuperAdmin, CompanyAdmin, Staff.",
      });
    }

    // 3. Validate status enum
    if (!["Active", "Inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed values: Active, Inactive.",
      });
    }

    // 4. Validate Company ID
    let assignedCompanyId = null;
    if (role !== "SuperAdmin") {
      assignedCompanyId = company_id || null;
      if (!assignedCompanyId) {
        return res.status(400).json({
          success: false,
          message: "Company assignment is required for CompanyAdmin and Staff roles.",
        });
      }

      // Check if company exists and is Active
      const [comp] = await db.query("SELECT id, status FROM companies WHERE id = ?", [assignedCompanyId]);
      if (comp.length === 0) {
        return res.status(400).json({
          success: false,
          message: "The assigned company does not exist.",
        });
      }
      if (comp[0].status !== "Active") {
        return res.status(400).json({
          success: false,
          message: "Cannot assign a user to an inactive company.",
        });
      }
    }

    // 5. Check if username exists
    const [existing] = await db.query("SELECT id FROM users WHERE username = ?", [trimmedUsername]);
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Username is already taken.",
      });
    }

    // 6. Hash password (salt rounds = 10)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 7. Insert user
    const [result] = await db.query(
      `INSERT INTO users (name, username, password, role, status, company_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name.trim(), trimmedUsername, hashedPassword, role, status, assignedCompanyId]
    );

    res.status(201).json({
      success: true,
      message: "User created successfully.",
      user: {
        id: result.insertId,
        name: name.trim(),
        username: trimmedUsername,
        role,
        status,
        company_id: assignedCompanyId,
      },
    });
  } catch (error) {
    console.error("createUser controller error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create user: " + error.message,
    });
  }
};

// @desc    Update a user
// @route   PUT /api/users/:id
// @access  Private (SuperAdmin only)
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, status, password, company_id } = req.body;

    // 1. Check if user exists
    const [existing] = await db.query("SELECT id, role, company_id FROM users WHERE id = ?", [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const userToUpdate = existing[0];

    // 2. Validate inputs
    if (!name || !role || !status) {
      return res.status(400).json({
        success: false,
        message: "Fields (name, role, status) are required.",
      });
    }

    if (!["SuperAdmin", "CompanyAdmin", "Staff"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Allowed values: SuperAdmin, CompanyAdmin, Staff.",
      });
    }

    if (!["Active", "Inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed values: Active, Inactive.",
      });
    }

    // 3. Validate Company ID
    let assignedCompanyId = null;
    if (role !== "SuperAdmin") {
      assignedCompanyId = company_id || null;
      if (!assignedCompanyId) {
        return res.status(400).json({
          success: false,
          message: "Company assignment is required for CompanyAdmin and Staff roles.",
        });
      }

      // Check if company exists
      const [comp] = await db.query("SELECT id, status FROM companies WHERE id = ?", [assignedCompanyId]);
      if (comp.length === 0) {
        return res.status(400).json({
          success: false,
          message: "The assigned company does not exist.",
        });
      }
    }

    // 4. SuperAdmin Protection: Check if changing role/status of last SuperAdmin
    if (userToUpdate.role === "SuperAdmin" && role !== "SuperAdmin") {
      const [admins] = await db.query("SELECT COUNT(1) AS count FROM users WHERE role = 'SuperAdmin'");
      if (admins[0].count <= 1) {
        return res.status(400).json({
          success: false,
          message: "Role cannot be changed. At least one SuperAdmin account must remain in the system.",
        });
      }
    }

    if (userToUpdate.role === "SuperAdmin" && status === "Inactive") {
      const [admins] = await db.query("SELECT COUNT(1) AS count FROM users WHERE role = 'SuperAdmin' AND status = 'Active'");
      if (admins[0].count <= 1) {
        return res.status(400).json({
          success: false,
          message: "Status cannot be set to Inactive. At least one Active SuperAdmin account must remain in the system.",
        });
      }
    }

    let updateQuery;
    let queryParams;

    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      updateQuery = `
        UPDATE users 
        SET name = ?, role = ?, status = ?, password = ?, company_id = ? 
        WHERE id = ?
      `;
      queryParams = [name.trim(), role, status, hashedPassword, assignedCompanyId, id];
    } else {
      updateQuery = `
        UPDATE users 
        SET name = ?, role = ?, status = ?, company_id = ? 
        WHERE id = ?
      `;
      queryParams = [name.trim(), role, status, assignedCompanyId, id];
    }

    await db.query(updateQuery, queryParams);

    res.json({
      success: true,
      message: "User updated successfully.",
    });
  } catch (error) {
    console.error("updateUser controller error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user: " + error.message,
    });
  }
};

// @desc    Delete a user
// @route   DELETE /api/users/:id
// @access  Private (SuperAdmin only)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Prevent self-deletion
    if (parseInt(id) === parseInt(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account.",
      });
    }

    // 2. Check if user exists
    const [existing] = await db.query("SELECT id, role FROM users WHERE id = ?", [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const userToDelete = existing[0];

    // 3. SuperAdmin Protection: Check if deleting the last SuperAdmin
    if (userToDelete.role === "SuperAdmin") {
      const [admins] = await db.query("SELECT COUNT(1) AS count FROM users WHERE role = 'SuperAdmin'");
      if (admins[0].count <= 1) {
        return res.status(400).json({
          success: false,
          message: "At least one SuperAdmin account must remain in the system.",
        });
      }
    }

    // 4. Perform deletion
    await db.query("DELETE FROM users WHERE id = ?", [id]);

    res.json({
      success: true,
      message: "User deleted successfully.",
    });
  } catch (error) {
    console.error("deleteUser controller error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user: " + error.message,
    });
  }
};
