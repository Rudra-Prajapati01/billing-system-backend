const express = require("express");
const router = express.Router();
const companyController = require("../controllers/tenantCompanyController");
const { protect, superAdminOnly } = require("../middleware/authMiddleware");

// Require auth and SuperAdmin check for all company management paths
router.use(protect, superAdminOnly);

router
  .route("/")
  .get(companyController.getCompanies)
  .post(companyController.createCompany);

router
  .route("/:id")
  .put(companyController.updateCompany);

router.post("/:id/assign-admin", companyController.assignAdmin);

module.exports = router;
