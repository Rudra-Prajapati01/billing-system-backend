const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate request body
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide both username and password.",
      });
    }

    // Check if user exists
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.username, u.password, u.role, u.status, u.company_id, c.company_name, c.status AS company_status
       FROM users u
       LEFT JOIN companies c ON u.company_id = c.id
       WHERE u.username = ?`,
      [username.trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    const user = rows[0];

    // Check if user status is Active
    if (user.status !== "Active") {
      return res.status(403).json({
        success: false,
        message: "Your account is deactivated. Please contact your administrator.",
      });
    }

    // Check if user's company is Active (for non-SuperAdmins)
    if (user.role !== "SuperAdmin" && user.company_id) {
      if (user.company_status !== "Active") {
        return res.status(403).json({
          success: false,
          message: "Your company has been deactivated. Access denied.",
        });
      }
    }

    // Match password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    // Create JWT
    const token = jwt.sign(
      { id: user.id, role: user.role, company_id: user.company_id },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Track Login Log
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    const userAgent = req.headers["user-agent"] || "";

    await db.query(
      `INSERT INTO login_logs (user_id, login_time, ip_address, user_agent) 
       VALUES (?, CURRENT_TIMESTAMP, ?, ?)`,
      [user.id, ip, userAgent]
    );

    // Send Response (Excluding password hash)
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        company_id: user.company_id,
        company_name: user.company_name || null
      },
    });
  } catch (error) {
    console.error("Login controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during login: " + error.message,
    });
  }
};

// @desc    Logout user (Stateless client side cleanup)
// @route   POST /api/auth/logout
// @access  Public
exports.logout = async (req, res) => {
  try {
    res.json({
      success: true,
    });
  } catch (error) {
    console.error("Logout controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during logout.",
    });
  }
};

// @desc    Get currently logged in user profile details
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    // req.user has been attached by the protect middleware
    res.json({
      success: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        username: req.user.username,
        role: req.user.role,
        company_id: req.user.company_id,
        company_name: req.user.company_name || null,
        status: req.user.status,
      },
    });
  } catch (error) {
    console.error("getMe controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error fetching user session.",
    });
  }
};
