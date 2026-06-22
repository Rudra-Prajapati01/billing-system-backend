const db = require("./db");
const bcrypt = require("bcryptjs");

async function initializeDatabase() {
  try {
    console.log("Starting database initialization...");

    // 1. Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NULL,
        name VARCHAR(255) NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('SuperAdmin', 'CompanyAdmin', 'Staff') DEFAULT 'CompanyAdmin',
        status ENUM('Active', 'Inactive') DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("Table 'users' verified/created.");

    // 2. Create index on username safely
    const [indexCheck] = await db.query(`
      SELECT COUNT(1) AS has_index 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND INDEX_NAME = 'idx_username'
    `);

    if (indexCheck[0].has_index === 0) {
      await db.query("CREATE INDEX idx_username ON users(username)");
      console.log("Index 'idx_username' created on table 'users'.");
    } else {
      console.log("Index 'idx_username' already exists.");
    }

    // 3. Create login_logs table
    await db.query(`
      CREATE TABLE IF NOT EXISTS login_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(100),
        user_agent TEXT
      )
    `);
    console.log("Table 'login_logs' verified/created.");

    // 4. Seed default SuperAdmin user 'rudra' if it does not exist
    const [users] = await db.query("SELECT id FROM users WHERE username = ?", ["rudra"]);
    if (users.length === 0) {
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash("rudra123", saltRounds);

      await db.query(
        `INSERT INTO users (name, username, password, role, status, company_id) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["Rudra", "rudra", hashedPassword, "SuperAdmin", "Active", null]
      );
      console.log("Default SuperAdmin user 'rudra' seeded successfully.");
    } else {
      console.log("Default SuperAdmin user 'rudra' already exists.");
    }

    console.log("Database initialization completed successfully.");
  } catch (error) {
    console.error("Database initialization failed:", error);
    throw error;
  }
}

module.exports = initializeDatabase;
