const fs = require('fs');
const files = ['bankRoutes.js', 'companyRoutes.js', 'customerReportRoutes.js', 'customerRoutes.js', 'invoiceRoutes.js', 'quotationRoutes.js', 'receiptRoutes.js', 'termsRoutes.js', 'leadRoutes.js', 'dashboardRoutes.js'];
files.forEach(f => {
  try {
    let code = fs.readFileSync('./routes/' + f, 'utf8');
    if (!code.includes('protect')) {
      code = code.replace(/(const express = require\([\s\S]*?\n)/, "$1const { protect } = require('../middleware/authMiddleware');\n");
      code = code.replace(/router\.(get|post|put|delete)\("([^"]+)",\s*(?!protect)([^)]+)\)/g, 'router.$1("$2", protect, $3)');
      // Some routes might use single quotes
      code = code.replace(/router\.(get|post|put|delete)\('([^']+)',\s*(?!protect)([^)]+)\)/g, "router.$1('$2', protect, $3)");
      fs.writeFileSync('./routes/' + f, code);
      console.log('Fixed ' + f);
    }
  } catch (e) {}
});
