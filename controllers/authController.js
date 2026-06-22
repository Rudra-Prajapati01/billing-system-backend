const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const catchAsync = require("../utils/catchAsync");

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
exports.login = catchAsync(async (req, res, next) => {
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
    `SELECT u.id, u.name, u.username, u.password, u.role, u.status, u.company_id, c.company_name, c.status AS company_status, u.failed_login_attempts, u.lockout_until
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

  // Check if user is active
  if (user.status !== "Active") {
    return res.status(403).json({
      success: false,
      message: "Your account is deactivated. Please contact your administrator.",
    });
  }

  // Check if user is locked out
  if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
    const remainingTime = Math.ceil((new Date(user.lockout_until) - new Date()) / 60000);
    return res.status(403).json({
      success: false,
      message: `Your account is temporarily locked due to multiple failed login attempts. Please try again in ${remainingTime} minute(s).`,
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
    const newAttempts = (user.failed_login_attempts || 0) + 1;
    let lockoutSql = "";
    let queryParams = [newAttempts, user.id];

    if (newAttempts >= 5) {
      const lockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 mins
      lockoutSql = ", lockout_until = ?";
      queryParams = [newAttempts, lockoutUntil, user.id];
    }

    await db.query(
      `UPDATE users SET failed_login_attempts = ? ${lockoutSql} WHERE id = ?`,
      queryParams
    );

    const attemptsRemaining = 5 - newAttempts;
    const failMessage = attemptsRemaining > 0
      ? `Invalid username or password. ${attemptsRemaining} attempts remaining before temporary lockout.`
      : "Invalid username or password. Your account has been locked for 15 minutes due to too many failed attempts.";

    return res.status(401).json({
      success: false,
      message: failMessage,
    });
  }

  // Successful Login - Reset Lockout & Failed Attempts
  await db.query(
    `UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = ?`,
    [user.id]
  );

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
});

// @desc    Logout user (Stateless client side cleanup)
// @route   POST /api/auth/logout
// @access  Public
exports.logout = catchAsync(async (req, res, next) => {
  res.json({
    success: true,
  });
});

// @desc    Get currently logged in user profile details
// @route   GET /api/auth/me
// @access  Private
exports.getMe = catchAsync(async (req, res, next) => {
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
});

