const express = require("express");
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();
const customerReportController = require("../controllers/customerReportController");

router.get("/customers", protect, customerReportController.getCustomers);
router.get("/summary/:customerId", protect, customerReportController.getSummary);
router.get("/ledger/:customerId", protect, customerReportController.getLedger);

module.exports = router;