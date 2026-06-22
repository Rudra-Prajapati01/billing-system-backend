const express = require("express");
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();
const multer = require("multer");
const path = require("path");

const {
  getCompanyProfile,
  createCompanyProfile,
  updateCompanyProfile,
} = require("../controllers/companyController");

// Configure Multer Storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|webp|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed"));
  }
});

// Multipart fields for logo and signature
const uploadFields = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "signature", maxCount: 1 },
]);

router.get("/", protect, getCompanyProfile);
router.post("/", protect, uploadFields, createCompanyProfile);
router.put("/:id", protect, uploadFields, updateCompanyProfile);

module.exports = router;
