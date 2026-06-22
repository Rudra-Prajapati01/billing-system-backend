const db = require("./db");

async function runPhase2Migration() {
  try {
    console.log("Starting SaaS Phase 2 Migration: Injecting company_id into tenant tables...");

    const tenantTables = [
      "customers",
      "quotations",
      "quotation_items",
      "invoices",
      "invoice_items",
      "payments",
      "receipts",
      "banks",
      "terms_conditions"
    ];

    const report = {
      tablesChecked: [],
      columnsAdded: [],
      rowsUpdated: {}
    };

    for (const tableName of tenantTables) {
      report.tablesChecked.push(tableName);
      
      // Check if table exists
      const [tableExists] = await db.query(`
        SELECT COUNT(1) AS count 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = ?
      `, [tableName]);

      if (tableExists[0].count === 0) {
        console.log(`Table '${tableName}' does not exist. Skipping...`);
        continue;
      }

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
        report.columnsAdded.push(tableName);
      }

      // Update existing records to default company (1)
      const [updateResult] = await db.query(`UPDATE ${tableName} SET company_id = 1 WHERE company_id IS NULL`);
      if (updateResult.affectedRows > 0) {
        console.log(`Updated ${updateResult.affectedRows} rows in '${tableName}' to default company_id = 1.`);
        report.rowsUpdated[tableName] = updateResult.affectedRows;
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

    console.log("SaaS Phase 2 Migration completed successfully.");
    console.log("Migration Report:", JSON.stringify(report, null, 2));
  } catch (error) {
    console.error("SaaS Phase 2 Migration failed:", error);
    throw error;
  }
}

module.exports = runPhase2Migration;

// Execute if run directly
if (require.main === module) {
  runPhase2Migration().then(() => process.exit(0)).catch(() => process.exit(1));
}
