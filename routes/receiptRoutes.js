const express = require("express");
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();
const receiptController = require("../controllers/receiptController");

router.get("/", protect, receiptController.getAllReceipts);
router.get("/next-number", protect, receiptController.getNextReceiptNumber);
router.post("/", protect, receiptController.createReceipt);
router.get("/:id", protect, receiptController.getReceiptById);
router.delete("/:id", protect, receiptController.deleteReceipt);

module.exports = router;