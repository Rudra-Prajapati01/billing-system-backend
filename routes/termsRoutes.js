const express = require("express");
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();
const {
  getTerms,
  addTerms,
  updateTerms,
  deleteTerms,
} = require("../controllers/termsController");

router.get("/", protect, getTerms);
router.post("/", protect, addTerms);
router.put("/:id", protect, updateTerms);
router.delete("/:id", protect, deleteTerms);

module.exports = router;
