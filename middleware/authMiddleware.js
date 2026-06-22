const jwt = require("jsonwebtoken");
const db = require("../config/db");

exports.protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to access this route. No token provided.",
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Token is invalid or has expired.",
        code: "TOKEN_INVALID",
      });
    }

    // Check if user exists in database
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.username, u.role, u.status, u.company_id, c.company_name, c.status AS company_status
       FROM users u
       LEFT JOIN companies c ON u.company_id = c.id
       WHERE u.id = ?`,
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "The user belonging to this token no longer exists.",
      });
    }

    const user = rows[0];

    // Check if user is active
    if (user.status !== "Active") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. You have been logged out.",
        code: "USER_INACTIVE",
      });
    }

    // Check if user's company is active (for non-SuperAdmins)
    if (user.role !== "SuperAdmin" && user.company_id) {
      if (user.company_status !== "Active") {
        return res.status(403).json({
          success: false,
          message: "Your company has been deactivated. Access denied.",
          code: "COMPANY_INACTIVE",
        });
      }
    }

    // Grant access to protected route by attaching user details to req
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during authentication.",
    });
  }
};

exports.superAdminOnly = (req, res, next) => {
  if (req.user && req.user.role === "SuperAdmin") {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: "Access denied. SuperAdmin role required.",
    });
  }
};
