const db = require("./db");

/**
 * Idempotently applies security schema changes, indexes, and foreign keys.
 */
async function runHardening() {
  try {
    console.log("Starting Database Hardening & Security Migrations...");

    // 1. Add account lockout columns to users table
    const [cols] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'failed_login_attempts'
    `);

    if (cols.length === 0) {
      await db.query(`
        ALTER TABLE users 
        ADD COLUMN failed_login_attempts INT DEFAULT 0,
        ADD COLUMN lockout_until TIMESTAMP NULL
      `);
      console.log("Added failed_login_attempts and lockout_until columns to users table.");
    } else {
      console.log("Account lockout columns already exist in users table.");
    }

    // 2. Audit and fix company_profile table columns
    const [cpTableExists] = await db.query(`
      SELECT COUNT(1) AS count 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'company_profile'
    `);

    if (cpTableExists[0].count > 0) {
      const [cpCols] = await db.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'company_profile' 
          AND COLUMN_NAME = 'company_id'
      `);

      if (cpCols.length === 0) {
        await db.query(`ALTER TABLE company_profile ADD COLUMN company_id INT NULL`);
        await db.query(`UPDATE company_profile SET company_id = 1 WHERE company_id IS NULL`);
        console.log("Added company_id column to company_profile.");
      }

      // Index on company_profile(company_id)
      const [cpIndex] = await db.query(`
        SELECT COUNT(1) AS has_index 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'company_profile' 
          AND INDEX_NAME = 'idx_company_profile_company_id'
      `);

      if (cpIndex[0].has_index === 0) {
        await db.query(`CREATE INDEX idx_company_profile_company_id ON company_profile(company_id)`);
        console.log("Created index idx_company_profile_company_id on company_profile.");
      }
    }

    // 3. Add Foreign Key constraints for SaaS tenant isolation
    const tenantTables = [
      "customers",
      "quotations",
      "quotation_items",
      "invoices",
      "invoice_items",
      "payments",
      "receipts",
      "banks",
      "terms_conditions",
      "company_profile"
    ];

    for (const tableName of tenantTables) {
      // Check if table exists
      const [tableCheck] = await db.query(`
        SELECT COUNT(1) AS count 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = ?
      `, [tableName]);

      if (tableCheck[0].count === 0) continue;

      const constraintName = `fk_${tableName}_company_id`;

      // Check if constraint exists
      const [constraintCheck] = await db.query(`
        SELECT COUNT(1) AS has_const 
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
        WHERE CONSTRAINT_SCHEMA = DATABASE() 
          AND TABLE_NAME = ? 
          AND CONSTRAINT_NAME = ?
      `, [tableName, constraintName]);

      if (constraintCheck[0].has_const === 0) {
        try {
          // Temporarily clean up any orphan records that don't match companies(id) to prevent FK failure
          await db.query(`
            UPDATE ${tableName} 
            SET company_id = 1 
            WHERE company_id IS NULL OR company_id NOT IN (SELECT id FROM companies)
          `);

          await db.query(`
            ALTER TABLE ${tableName} 
            ADD CONSTRAINT ${constraintName} 
            FOREIGN KEY (company_id) REFERENCES companies(id) 
            ON DELETE CASCADE
          `);
          console.log(`Added foreign key constraint '${constraintName}' on '${tableName}'.`);
        } catch (fkError) {
          console.warn(`Could not add FK constraint on ${tableName}:`, fkError.message);
        }
      }
    }

    console.log("Database Hardening completed successfully.");
  } catch (err) {
    console.error("Database Hardening failed:", err);
    throw err;
  }
}

module.exports = runHardening;

// Run if executed directly
if (require.main === module) {
  runHardening()
    .then(() => {
      console.log("Hardening successful.");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
