const db = require("./db");

async function runPhase3Migration() {
  try {
    console.log("Starting SaaS Phase 3 Migration: Creating impersonation_logs table...");

    await db.query(`
      CREATE TABLE IF NOT EXISTS impersonation_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        super_admin_id INT NOT NULL,
        company_id INT NOT NULL,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        logout_time DATETIME NULL,
        ip_address VARCHAR(100),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log("Table 'impersonation_logs' verified/created.");
    console.log("SaaS Phase 3 Migration completed successfully.");
  } catch (error) {
    console.error("SaaS Phase 3 Migration failed:", error);
    throw error;
  }
}

module.exports = runPhase3Migration;

// Execute if run directly
if (require.main === module) {
  runPhase3Migration().then(() => process.exit(0)).catch(() => process.exit(1));
}
