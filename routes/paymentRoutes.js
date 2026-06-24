const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");
const paymentController = require("../controllers/paymentController");

router.get("/", protect, paymentController.getPayments);
router.post("/", protect, paymentController.addPayment);
router.put("/:id", protect, paymentController.updatePayment);
router.delete("/:id", protect, paymentController.deletePayment);
router.get("/summary", protect, paymentController.getInvoiceSummary);

module.exports = router;