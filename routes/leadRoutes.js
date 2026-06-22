const express = require("express");
const router = express.Router();

const {
  getLeads,
  addLead,
  updateLead,
  deleteLead
} = require("../controllers/leadController");

const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getLeads);
router.post("/", protect, addLead);
router.put("/:id", protect, updateLead);
router.delete("/:id", protect, deleteLead);

module.exports = router;