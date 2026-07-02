const db = require("../config/db");
const { getTenantFilter } = require("../utils/tenantHelper");
const moment = require("moment");

const getDateRange = (rangeType, dateColumn) => {
  if (!rangeType || rangeType === 'overall' || rangeType === 'recent' || rangeType === 'system') return { sql: '', params: [] };
  
  let startDate = null;
  let endDate = null;
  
  if (rangeType === 'today') {
    startDate = moment().startOf('day');
    endDate = moment().endOf('day');
  } else if (rangeType === 'week') {
    startDate = moment().subtract(7, 'days').startOf('day');
    endDate = moment().endOf('day');
  } else if (rangeType === 'month') {
    startDate = moment().startOf('month');
    endDate = moment().endOf('month');
  } else if (rangeType === 'quarter') {
    startDate = moment().startOf('quarter');
    endDate = moment().endOf('quarter');
  } else if (rangeType === 'year') {
    startDate = moment().startOf('year');
    endDate = moment().endOf('year');
  }

  if (startDate && endDate) {
    return { 
      sql: ` AND ${dateColumn} >= ? AND ${dateColumn} <= ?`, 
      params: [startDate.format('YYYY-MM-DD HH:mm:ss'), endDate.format('YYYY-MM-DD HH:mm:ss')] 
    };
  }
  return { sql: '', params: [] };
};

exports.getSuperAdminDashboardData = async (req, res) => {
  try {
    // ---------------------------------------------------------
    // SUPER ADMIN DASHBOARD (Strictly Platform Data Only)
    // ---------------------------------------------------------
      
      const [[companyStats]] = await db.query(`
        SELECT 
          COUNT(id) as totalCompanies,
          SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as activeCompanies,
          SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) as inactiveCompanies,
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as newCompanies
        FROM companies
      `);

      const [[userStats]] = await db.query(`
        SELECT 
          COUNT(id) as totalUsers,
          SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as activeUsers,
          SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) as inactiveUsers,
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as newUsers
        FROM users
      `);

      const [recentCompanies] = await db.query(`
        SELECT id, company_name, company_code, status, created_at 
        FROM companies 
        ORDER BY created_at DESC 
        LIMIT 5
      `);

      const [recentUsers] = await db.query(`
        SELECT u.id, u.name, u.username, u.role, c.company_name, u.created_at
        FROM users u
        LEFT JOIN companies c ON u.company_id = c.id
        ORDER BY u.created_at DESC
        LIMIT 5
      `);

      // Platform Analytics - Monthly Company Registrations (Last 12 months)
      const chartMap = new Map();
      for (let i = 11; i >= 0; i--) {
        const m = moment().subtract(i, 'months').format('MMM YY');
        chartMap.set(m, { newCompanies: 0 });
      }
      
      const [companiesGrowth] = await db.query(`
        SELECT created_at FROM companies 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      `);
      
      companiesGrowth.forEach(c => {
        const k = moment(c.created_at).format('MMM YY');
        if(chartMap.has(k)) {
          chartMap.get(k).newCompanies += 1;
        }
      });

      const [usersGrowth] = await db.query(`
        SELECT created_at FROM users 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      `);
      
      usersGrowth.forEach(u => {
        const k = moment(u.created_at).format('MMM YY');
        if(chartMap.has(k)) {
          chartMap.get(k).newUsers = (chartMap.get(k).newUsers || 0) + 1;
        }
      });

      const chartData = { months: [], newCompanies: [], newUsers: [] };
      for (let [key, val] of chartMap) {
        chartData.months.push(key);
        chartData.newCompanies.push(val.newCompanies);
        chartData.newUsers.push(val.newUsers || 0);
      }

      return res.status(200).json({
        success: true,
        data: {
          totalCompanies: companyStats.totalCompanies || 0,
          activeCompanies: companyStats.activeCompanies || 0,
          inactiveCompanies: companyStats.inactiveCompanies || 0,
          newCompanies: companyStats.newCompanies || 0,
          totalUsers: userStats.totalUsers || 0,
          activeUsers: userStats.activeUsers || 0,
          inactiveUsers: userStats.inactiveUsers || 0,
          newUsers: userStats.newUsers || 0,
          recentCompanies,
          recentUsers,
          chartData
        }
      });
  } catch (err) {
    console.error("Error in getSuperAdminDashboardData:", err);
    res.status(500).json({ success: false, error: "Failed to fetch platform dashboard data", message: err.message });
  }
};

exports.getDashboardData = async (req, res) => {
  try {
    // ---------------------------------------------------------
    // COMPANY DASHBOARD (Business Data)
    // ---------------------------------------------------------
    
    // getTenantFilter will strictly throw 403 if SuperAdmin tries to reach here directly
    const { filterSql, filterParams } = getTenantFilter(req);
    const { filterSql: iFilterSql, filterParams: iFilterParams } = getTenantFilter(req, "i");

    const range = req.query.range || 'year';
    const productsRange = req.query.productsRange || 'overall';
    const customersRange = req.query.customersRange || 'recent';
    const activityType = req.query.activityType || 'system';
    const leadRange = req.query.leadRange || 'year';

    const globalDateInvoice = getDateRange(range, 'invoice_date');
    const globalDateCustomer = getDateRange(range, 'created_at');
    const globalDatePayment = getDateRange(range, 'p.payment_date');

    // 1. Top Cards
    const [[revenueRes]] = await db.query(
        `SELECT COALESCE(SUM(grand_total), 0) as totalRevenue FROM invoices WHERE 1=1 ${filterSql} ${globalDateInvoice.sql}`, 
        [...filterParams, ...globalDateInvoice.params]
    );
    const [[invoiceCountRes]] = await db.query(
        `SELECT COUNT(id) as totalInvoices FROM invoices WHERE 1=1 ${filterSql} ${globalDateInvoice.sql}`, 
        [...filterParams, ...globalDateInvoice.params]
    );
    const [[customerCountRes]] = await db.query(
        `SELECT COUNT(id) as totalCustomers FROM customers WHERE 1=1 ${filterSql} ${globalDateCustomer.sql}`, 
        [...filterParams, ...globalDateCustomer.params]
    );
    
    const [[totalPaymentsRes]] = await db.query(
        `SELECT COALESCE(SUM(p.amount), 0) as totalPayments 
         FROM payments p JOIN invoices i ON p.invoice_id = i.id 
         WHERE 1=1 ${iFilterSql} ${globalDatePayment.sql}`, 
        [...iFilterParams, ...globalDatePayment.params]
    );
    
    const pendingAmount = parseFloat(revenueRes.totalRevenue) - parseFloat(totalPaymentsRes.totalPayments);

    // 2. Chart Logic
    const [invoices] = await db.query(`SELECT invoice_date, grand_total FROM invoices WHERE 1=1 ${filterSql} ${globalDateInvoice.sql}`, [...filterParams, ...globalDateInvoice.params]);
    const [payments] = await db.query(`
      SELECT p.payment_date, p.amount 
      FROM payments p 
      JOIN invoices i ON p.invoice_id = i.id 
      WHERE 1=1 ${iFilterSql} ${globalDatePayment.sql}
    `, [...iFilterParams, ...globalDatePayment.params]);

    const chartData = { months: [], revenue: [], collections: [], invoices: [] };
    const chartMap = new Map();

    if (range === 'today') {
      for (let i = 0; i < 24; i++) {
        const h = moment().startOf('day').add(i, 'hours').format('HA');
        chartMap.set(h, { revenue: 0, collections: 0, invoices: 0 });
      }
      invoices.forEach(inv => {
        const k = moment(inv.invoice_date).format('HA');
        if(chartMap.has(k)) {
          chartMap.get(k).revenue += parseFloat(inv.grand_total);
          chartMap.get(k).invoices += 1;
        }
      });
      payments.forEach(pay => {
        const k = moment(pay.payment_date).format('HA');
        if(chartMap.has(k)) chartMap.get(k).collections += parseFloat(pay.amount);
      });
    } else if (range === 'week') {
      for (let i = 6; i >= 0; i--) {
        const d = moment().subtract(i, 'days').format('ddd (DD/MM)');
        chartMap.set(d, { revenue: 0, collections: 0, invoices: 0 });
      }
      invoices.forEach(inv => {
        const k = moment(inv.invoice_date).format('ddd (DD/MM)');
        if(chartMap.has(k)) {
          chartMap.get(k).revenue += parseFloat(inv.grand_total);
          chartMap.get(k).invoices += 1;
        }
      });
      payments.forEach(pay => {
        const k = moment(pay.payment_date).format('ddd (DD/MM)');
        if(chartMap.has(k)) chartMap.get(k).collections += parseFloat(pay.amount);
      });
    } else if (range === 'month') {
      const daysInMonth = moment().daysInMonth();
      for (let i = 1; i <= daysInMonth; i++) {
        const d = moment().date(i).format('DD MMM');
        chartMap.set(d, { revenue: 0, collections: 0, invoices: 0 });
      }
      invoices.forEach(inv => {
        const k = moment(inv.invoice_date).format('DD MMM');
        if(chartMap.has(k)) {
          chartMap.get(k).revenue += parseFloat(inv.grand_total);
          chartMap.get(k).invoices += 1;
        }
      });
      payments.forEach(pay => {
        const k = moment(pay.payment_date).format('DD MMM');
        if(chartMap.has(k)) chartMap.get(k).collections += parseFloat(pay.amount);
      });
    } else if (range === 'quarter') {
      for (let i = 2; i >= 0; i--) {
        const m = moment().endOf('quarter').subtract(i, 'months').format('MMM YYYY');
        chartMap.set(m, { revenue: 0, collections: 0, invoices: 0 });
      }
      invoices.forEach(inv => {
        const k = moment(inv.invoice_date).format('MMM YYYY');
        if(chartMap.has(k)) {
          chartMap.get(k).revenue += parseFloat(inv.grand_total);
          chartMap.get(k).invoices += 1;
        }
      });
      payments.forEach(pay => {
        const k = moment(pay.payment_date).format('MMM YYYY');
        if(chartMap.has(k)) chartMap.get(k).collections += parseFloat(pay.amount);
      });
    } else { // year or overall
      for (let i = 11; i >= 0; i--) {
        const m = moment().subtract(i, 'months').format('MMM YY');
        chartMap.set(m, { revenue: 0, collections: 0, invoices: 0 });
      }
      invoices.forEach(inv => {
        const k = moment(inv.invoice_date).format('MMM YY');
        if(chartMap.has(k)) {
          chartMap.get(k).revenue += parseFloat(inv.grand_total);
          chartMap.get(k).invoices += 1;
        }
      });
      payments.forEach(pay => {
        const k = moment(pay.payment_date).format('MMM YY');
        if(chartMap.has(k)) chartMap.get(k).collections += parseFloat(pay.amount);
      });
    }

    for (let [key, val] of chartMap) {
      chartData.months.push(key);
      chartData.revenue.push(parseFloat(val.revenue.toFixed(2)));
      chartData.collections.push(parseFloat(val.collections.toFixed(2)));
      chartData.invoices.push(val.invoices);
    }

    // 3. Top Products
    const prodDate = getDateRange(productsRange, 'i.invoice_date');
    const [topProducts] = await db.query(`
      SELECT item.service_name as name, SUM(item.qty) as totalQty 
      FROM invoice_items item
      JOIN invoices i ON item.invoice_id = i.id
      WHERE 1=1 ${filterSql.replace('company_id', 'item.company_id')} ${prodDate.sql}
      GROUP BY item.service_name 
      ORDER BY totalQty DESC 
      LIMIT 5
    `, [...filterParams, ...prodDate.params]);

    // 4. Latest Customers
    const custDate = getDateRange(customersRange, 'created_at');
    const [latestCustomers] = await db.query(`
      SELECT customer_name as name, company_name as company, city 
      FROM customers 
      WHERE 1=1 ${filterSql} ${custDate.sql}
      ORDER BY id DESC 
      LIMIT 5
    `, [...filterParams, ...custDate.params]);

    // 5. Recent Activity
    let activityQueries = [];
    let actParams = [];

    if (activityType === 'system' || activityType === 'customers') {
      activityQueries.push(`SELECT 'New Customer Added' as title, created_at as time FROM customers WHERE 1=1 ${filterSql}`);
      actParams.push(...filterParams);
    }
    if (activityType === 'system' || activityType === 'invoices') {
      activityQueries.push(`SELECT CONCAT('Invoice ', invoice_no, ' Created') as title, created_at as time FROM invoices WHERE 1=1 ${filterSql}`);
      actParams.push(...filterParams);
    }
    if (activityType === 'system' || activityType === 'quotations') {
      activityQueries.push(`SELECT CONCAT('Quotation ', quotation_no, ' Created') as title, created_at as time FROM quotations WHERE 1=1 ${filterSql}`);
      actParams.push(...filterParams);
    }
    if (activityType === 'system' || activityType === 'payments') {
      activityQueries.push(`SELECT CONCAT('Payment of INR ', amount, ' Received') as title, p.created_at as time FROM payments p JOIN invoices i ON p.invoice_id = i.id WHERE 1=1 ${iFilterSql}`);
      actParams.push(...iFilterParams);
    }
    if (activityType === 'system' || activityType === 'leads') {
      activityQueries.push(`SELECT CONCAT('Lead ', lead_no, ' Created') as title, created_at as time FROM leads WHERE 1=1 ${filterSql}`);
      actParams.push(...filterParams);
    }

    let formattedActivities = [];
    if (activityQueries.length > 0) {
      const [recentActivities] = await db.query(`
        ${activityQueries.join(' UNION ALL ')}
        ORDER BY time DESC
        LIMIT 10
      `, actParams);

      const now = new Date();
      formattedActivities = recentActivities.map(a => {
          const d = new Date(a.time);
          const diffMs = now - d;
          const diffMins = Math.floor(diffMs / 60000);
          let timeStr = "";
          if (diffMins < 60) timeStr = `${diffMins} min ago`;
          else if (diffMins < 1440) timeStr = `${Math.floor(diffMins / 60)} hr ago`;
          else timeStr = `${Math.floor(diffMins / 1440)} days ago`;
          return { title: a.title, time: timeStr };
      });
    }

    // 6. Lead Status Overview
    const ldDate = getDateRange(leadRange, 'created_at');
    const [leadsStatus] = await db.query(`
      SELECT status, COUNT(*) as count 
      FROM leads 
      WHERE 1=1 ${filterSql} ${ldDate.sql}
      GROUP BY status
    `, [...filterParams, ...ldDate.params]);
    
    const leadStatusSummary = {
      Pending: 0,
      Inprocess: 0,
      Order: 0,
      Closed: 0,
      Cancel: 0
    };
    leadsStatus.forEach(row => {
      if (leadStatusSummary[row.status] !== undefined) {
        leadStatusSummary[row.status] = row.count;
      }
    });

    res.status(200).json({
      superAdmin: false,
      totalRevenue: revenueRes.totalRevenue || 0,
      totalInvoices: invoiceCountRes.totalInvoices || 0,
      totalCustomers: customerCountRes.totalCustomers || 0,
      pendingAmount: pendingAmount || 0,
      chartData,
      topProducts,
      latestCustomers,
      recentActivities: formattedActivities,
      leadStatusSummary
    });

  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ success: false, message: "Server error while fetching dashboard data." });
  }
};

