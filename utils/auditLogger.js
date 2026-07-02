const db = require("../config/db");

const logAudit = async (req, action) => {
  try {
    const user_id = req.user?.id || null;
    const company_id = req.user?.company_id || null;
    const role = req.user?.role || null;
    const ip_address = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";

    if (!user_id) return; // Only log authenticated user actions

    await db.query(
      `INSERT INTO audit_logs (user_id, company_id, role, action, ip_address) VALUES (?, ?, ?, ?, ?)`,
      [user_id, company_id, role, action, ip_address]
    );
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
};

module.exports = { logAudit };
