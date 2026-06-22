const db = require("./db");

async function runSaaSMigration() {
  try {
    console.log("Starting Multi-Company SaaS Data Migration...");

    // 1. Create companies table
    await db.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        company_code VARCHAR(100) UNIQUE NOT NULL,
        contact_person VARCHAR(255) NULL,
        email VARCHAR(255) NULL,
        mobile VARCHAR(50) NULL,
        address TEXT NULL,
        status ENUM('Active', 'Inactive') DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("Table 'companies' verified/created.");

    // 2. Seed Default Billing Company if not exists
    const [companies] = await db.query("SELECT id FROM companies WHERE id = 1");
    if (companies.length === 0) {
      await db.query(`
        INSERT INTO companies (id, company_name, company_code, status) 
        VALUES (1, 'Default Billing Company', 'DEFAULT', 'Active')
      `);
      console.log("Default Billing Company seeded.");
    } else {
      console.log("Default Billing Company already exists.");
    }

    // 3. Helper to idempotently add column and index
    const tablesToAlter = [
      "users",
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

    for (const tableName of tablesToAlter) {
      // Check column existence
      const [cols] = await db.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = ? 
          AND COLUMN_NAME = 'company_id'
      `, [tableName]);

      if (cols.length === 0) {
        // Column missing, alter table
        await db.query(`ALTER TABLE ${tableName} ADD COLUMN company_id INT NULL`);
        console.log(`Added column 'company_id' to table '${tableName}'.`);
      }

      // Move NULL company_ids to default company (1)
      if (tableName === "users") {
        await db.query("UPDATE users SET company_id = 1 WHERE company_id IS NULL AND role != 'SuperAdmin'");
      } else {
        await db.query(`UPDATE ${tableName} SET company_id = 1 WHERE company_id IS NULL`);
      }

      // Create index safely
      const indexName = `idx_${tableName}_company_id`;
      const [indexCheck] = await db.query(`
        SELECT COUNT(1) AS has_index 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = ? 
          AND INDEX_NAME = ?
      `, [tableName, indexName]);

      if (indexCheck[0].has_index === 0) {
        await db.query(`CREATE INDEX ${indexName} ON ${tableName}(company_id)`);
        console.log(`Created index '${indexName}' on table '${tableName}'.`);
      }
    }

    // 4. Safely add foreign key constraint on users table
    const [constraintCheck] = await db.query(`
      SELECT COUNT(1) AS has_const 
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE CONSTRAINT_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND CONSTRAINT_NAME = 'fk_users_company_id'
    `);

    if (constraintCheck[0].has_const === 0) {
      await db.query(`
        ALTER TABLE users 
        ADD CONSTRAINT fk_users_company_id 
        FOREIGN KEY (company_id) REFERENCES companies(id) 
        ON DELETE SET NULL
      `);
      console.log("Added foreign key constraint 'fk_users_company_id' on 'users'.");
    } else {
      console.log("Foreign key constraint 'fk_users_company_id' already exists.");
    }

    console.log("Multi-Company SaaS Data Migration completed successfully.");
  } catch (error) {
    console.error("Multi-Company SaaS Data Migration failed:", error);
    throw error;
  }
}

module.exports = runSaaSMigration;
