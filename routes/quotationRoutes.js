const express = require("express");
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();
const {
  getQuotations,
  getNextQuotationNumber,
  addQuotation,
  deleteQuotation,
  getQuotationById,
  updateQuotation // Added Edit Function
} = require("../controllers/quotationController");

router.get("/", protect, getQuotations);
router.get("/next-number", protect, getNextQuotationNumber);
router.get("/:id", protect, getQuotationById);
router.post("/", protect, addQuotation);
router.put("/:id", protect, updateQuotation); // Added PUT Route
router.delete("/:id", protect, deleteQuotation);

module.exports = router;