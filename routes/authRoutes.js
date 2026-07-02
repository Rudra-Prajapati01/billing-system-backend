const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Route configurations
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.get("/me", protect, authController.getMe);
router.post("/impersonate", protect, authController.impersonate);
router.post("/exit-impersonation", protect, authController.exitImpersonation);

module.exports = router;
