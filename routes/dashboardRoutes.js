const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const dashboardController = require("../controllers/dashboardController");

router.get("/superadmin", protect, dashboardController.getSuperAdminDashboardData);
router.get("/", protect, dashboardController.getDashboardData);

module.exports = router;
