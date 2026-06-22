const express = require("express");
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();
const {
  getInvoices,
  getNextInvoiceNumber,
  addInvoice,
  deleteInvoice,
  getInvoiceById,
  updateInvoice // Newly imported function
} = require("../controllers/invoiceController");

router.get("/", protect, getInvoices);
router.get("/next-number", protect, getNextInvoiceNumber);
router.get("/:id", protect, getInvoiceById);
router.post("/", protect, addInvoice);
router.put("/:id", protect, updateInvoice); // New route for Edit/Update
router.delete("/:id", protect, deleteInvoice);

module.exports = router;