const mysql = require("mysql2");
require("dotenv").config();

// Log what DB credentials are being used (redacted password)
console.log("[DB] Creating connection pool:");
console.log("  Host:", process.env.DB_HOST);
console.log("  User:", process.env.DB_USER);
console.log("  Database:", process.env.DB_NAME);
console.log("  Password:", process.env.DB_PASSWORD ? "***SET***" : "***MISSING***");
console.log("ENV HOST =", process.env.DB_HOST);
console.log("ENV USER =", process.env.DB_USER);
console.log("ENV DB =", process.env.DB_NAME);

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test the connection immediately and log result
db.promise().query("SELECT 1")
  .then(() => console.log("[DB] Connection test successful"))
  .catch((err) => console.error("[DB] Connection test FAILED:", err.message));

module.exports = db.promise();