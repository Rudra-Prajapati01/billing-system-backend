const db = require('./config/db');
const moment = require('moment');

(async () => {
  try {
    const [[companyStats]] = await db.query(`
      SELECT 
        COUNT(id) as totalCompanies,
        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as activeCompanies,
        SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) as inactiveCompanies,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as newCompanies
      FROM companies
    `);
    console.log('companyStats', companyStats);

    const [[userStats]] = await db.query(`
      SELECT COUNT(id) as totalUsers FROM users
    `);
    console.log('userStats', userStats);

    const [recentCompanies] = await db.query(`
      SELECT id, company_name, company_code, status, created_at 
      FROM companies 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    console.log('recentCompanies', recentCompanies.length);

    const [recentUsers] = await db.query(`
      SELECT u.id, u.name, u.email, u.role, c.company_name, u.created_at
      FROM users u
      LEFT JOIN companies c ON u.company_id = c.id
      ORDER BY u.created_at DESC
      LIMIT 5
    `);
    console.log('recentUsers', recentUsers.length);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
})();
