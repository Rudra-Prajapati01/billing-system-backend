const express = require("express");
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();
const {
  getBanks,
  addBank,
  updateBank,
  deleteBank,
} = require("../controllers/bankController");

router.get("/", protect, getBanks);
router.post("/", protect, addBank);
router.put("/:id", protect, updateBank);
router.delete("/:id", protect, deleteBank);

module.exports = router;
