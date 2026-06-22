const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const logger = require("./utils/logger");
const sanitizeInput = require("./middleware/sanitize");
const errorMiddleware = require("./middleware/errorMiddleware");
require("dotenv").config();

// 1. Fail-fast if critical environment variables are missing in production
const requiredEnvVars = ["JWT_SECRET", "DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  logger.error(`FATAL STARTUP ERROR: The following environment variables are missing: ${missingVars.join(", ")}`);
  process.exit(1);
}

// 2. Initialize Database & Run Migrations
require("./config/dbInit");
require("./config/saasMigration")(); 
require("./config/saasPhase2Migration")(); 

const app = express();

// 3. Security Middlewares
app.use(helmet()); // Apply security headers

// Configure whitelisted CORS origins for production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : ["http://localhost:5173", "http://localhost:3000"];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, postman, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
      callback(null, true);
    } else {
      callback(new Error("Blocked by CORS security policy"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(sanitizeInput); // Prevent XSS by sanitizing all incoming fields

// 4. Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again after 15 minutes."
  }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 general API requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later."
  }
});

// Apply rate limiting
app.use("/api/auth/login", authLimiter);
app.use("/api", apiLimiter);

// 5. Static Files & Auto-create uploads directory
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use("/uploads", express.static(uploadsDir));

// 6. API Route Registrations
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

const userRoutes = require("./routes/userRoutes");
app.use("/api/users", userRoutes);

const tenantCompanyRoutes = require("./routes/tenantCompanyRoutes");
app.use("/api/tenant-companies", tenantCompanyRoutes);
logger.info("Tenant Company Routes Loaded Successfully");

const customerRoutes = require("./routes/customerRoutes");
app.use("/api/customers", customerRoutes);

const companyRoutes = require("./routes/companyRoutes");
app.use("/api/company-profile", companyRoutes);

const bankRoutes = require("./routes/bankRoutes");
app.use("/api/banks", bankRoutes);

const termsRoutes = require("./routes/termsRoutes");
app.use("/api/terms", termsRoutes);

const quotationRoutes = require("./routes/quotationRoutes");
app.use("/api/quotations", quotationRoutes);

const invoiceRoutes = require("./routes/invoiceRoutes");
app.use("/api/invoices", invoiceRoutes);

const paymentRoutes = require("./routes/paymentRoutes");
app.use("/api/payments", paymentRoutes);

const receiptRoutes = require("./routes/receiptRoutes");
app.use("/api/receipts", receiptRoutes);

const customerReportRoutes = require("./routes/customerReportRoutes");
app.use("/api/customer-report", customerReportRoutes);

const leadRoutes = require("./routes/leadRoutes");
app.use("/api/leads", leadRoutes);

const dashboardRoutes = require("./routes/dashboardRoutes");
app.use("/api/dashboard", dashboardRoutes);

// 7. Base API Route
app.get("/", (req, res) => {
  res.send("Billing System API Running");
});

// 8. Global Error Handler Middleware (must be registered last)
app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
});