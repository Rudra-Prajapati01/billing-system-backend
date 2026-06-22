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

// ===============================
// ENV CHECK
// ===============================
const requiredEnvVars = [
  "JWT_SECRET",
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
];

const missingVars = requiredEnvVars.filter(
  (v) => !process.env[v]
);

if (missingVars.length > 0) {
  console.error(
    `Missing ENV Variables: ${missingVars.join(", ")}`
  );
  process.exit(1);
}

// ===============================
// DB INIT & MIGRATIONS
// ===============================
require("./config/dbInit");
require("./config/saasMigration")();
require("./config/saasPhase2Migration")();

const app = express();

// ===============================
// SECURITY
// ===============================
app.use(helmet());

// ===============================
// CORS CONFIG
// ===============================
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://techrisebee.com",
      "https://www.techrisebee.com",
    ];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow Postman, Mobile Apps, Curl, or local tests without origin header
    if (!origin) {
      return callback(null, true);
    }

    const isAllowed = allowedOrigins.some(
      (allowed) => allowed.toLowerCase() === origin.toLowerCase()
    );

    if (isAllowed || process.env.NODE_ENV !== "production") {
      return callback(null, true);
    }

    console.log("Blocked Origin:", origin);
    // Return false instead of throwing Error to prevent Express 500 route failure
    return callback(null, false);
  },

  credentials: true,
  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "X-Company-Id", // CRITICAL: Required for SaaS tenant switching
  ],
  optionsSuccessStatus: 200,
};

// Apply CORS globally
app.use(cors(corsOptions));

// ===============================
// BODY PARSER
// ===============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// SANITIZE INPUT
// ===============================
app.use(sanitizeInput);

// ===============================
// RATE LIMITERS
// ===============================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many login attempts. Please try again after 15 minutes.",
  },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many requests. Please try again later.",
  },
});

app.use("/api/auth/login", authLimiter);
app.use("/api", apiLimiter);

// ===============================
// UPLOADS
// ===============================
const uploadsDir = path.join(
  __dirname,
  "uploads"
);

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

app.use(
  "/uploads",
  express.static(uploadsDir)
);

// ===============================
// ROUTES
// ===============================
app.use(
  "/api/auth",
  require("./routes/authRoutes")
);

app.use(
  "/api/users",
  require("./routes/userRoutes")
);

app.use(
  "/api/tenant-companies",
  require("./routes/tenantCompanyRoutes")
);

app.use(
  "/api/customers",
  require("./routes/customerRoutes")
);

app.use(
  "/api/company-profile",
  require("./routes/companyRoutes")
);

app.use(
  "/api/banks",
  require("./routes/bankRoutes")
);

app.use(
  "/api/terms",
  require("./routes/termsRoutes")
);

app.use(
  "/api/quotations",
  require("./routes/quotationRoutes")
);

app.use(
  "/api/invoices",
  require("./routes/invoiceRoutes")
);

app.use(
  "/api/payments",
  require("./routes/paymentRoutes")
);

app.use(
  "/api/receipts",
  require("./routes/receiptRoutes")
);

app.use(
  "/api/customer-report",
  require("./routes/customerReportRoutes")
);

app.use(
  "/api/leads",
  require("./routes/leadRoutes")
);

app.use(
  "/api/dashboard",
  require("./routes/dashboardRoutes")
);

// ===============================
// HEALTH CHECK
// ===============================
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Billing System API Running",
    environment:
      process.env.NODE_ENV || "development",
  });
});

// ===============================
// 404 HANDLER (Express 5 safe - no wildcard path string)
// ===============================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API Route Not Found",
  });
});

// ===============================
// ERROR HANDLER
// ===============================
app.use(errorMiddleware);

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`
===================================
🚀 Billing API Started
PORT: ${PORT}
MODE: ${process.env.NODE_ENV}
===================================
`);
});