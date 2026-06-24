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
// LOG LOADED ENV (redacted passwords)
// ===============================
console.log("[STARTUP] Environment loaded:");
console.log("  NODE_ENV:", process.env.NODE_ENV);
console.log("  DB_HOST:", process.env.DB_HOST);
console.log("  DB_USER:", process.env.DB_USER);
console.log("  DB_NAME:", process.env.DB_NAME);
console.log("  DB_PASSWORD:", process.env.DB_PASSWORD ? "***SET***" : "***MISSING***");
console.log("  JWT_SECRET:", process.env.JWT_SECRET ? "***SET***" : "***MISSING***");

const app = express();

// ===============================
// SECURITY — Helmet configured for cross-origin API
// ===============================
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: false,
}));

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

console.log("[STARTUP] ALLOWED_ORIGINS:", allowedOrigins);

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

    console.log("[CORS] Blocked Origin:", origin);
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
    "X-Company-Id",
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
console.log("[STARTUP] Loading routes...");

const authRoutes = require("./routes/authRoutes");
console.log("[STARTUP] AUTH ROUTES LOADED");

app.use("/api/auth", authRoutes);
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/tenant-companies", require("./routes/tenantCompanyRoutes"));
app.use("/api/customers", require("./routes/customerRoutes"));
app.use("/api/company-profile", require("./routes/companyRoutes"));
app.use("/api/banks", require("./routes/bankRoutes"));
app.use("/api/terms", require("./routes/termsRoutes"));
app.use("/api/quotations", require("./routes/quotationRoutes"));
app.use("/api/invoices", require("./routes/invoiceRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/receipts", require("./routes/receiptRoutes"));
app.use("/api/customer-report", require("./routes/customerReportRoutes"));
app.use("/api/leads", require("./routes/leadRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));

console.log("[STARTUP] All routes loaded successfully");

// ===============================
// DB CONNECTION TEST ROUTE (temporary debug)
// ===============================
const db = require("./config/db");

app.get("/db-test", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 as test");
    res.json({ success: true, dbConnected: true, rows });
  } catch (err) {
    console.error("[DB-TEST] Connection failed:", err.message);
    res.status(500).json({
      success: false,
      dbConnected: false,
      error: err.message,
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      database: process.env.DB_NAME,
    });
  }
});

// ===============================
// HEALTH CHECK
// ===============================
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Billing System API Running",
    environment: process.env.NODE_ENV || "development",
    dbHost: process.env.DB_HOST,
  });
});

// ===============================
// 404 HANDLER (Express 5 safe — no wildcard path string)
// ===============================
app.use((req, res) => {
  console.log("[404]", req.method, req.originalUrl);
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
// ASYNC STARTUP — Migrations run with proper await + error handling
// ===============================
const PORT = process.env.PORT || 5000;

async function startServer() {
  // Run migrations sequentially, catch errors without crashing
  try {
    console.log("[STARTUP] Running database initialization...");
    const initializeDatabase = require("./config/dbInit");
    await initializeDatabase();
    console.log("[STARTUP] Database initialization complete");

    console.log("[STARTUP] Running SaaS migration...");
    const runSaaSMigration = require("./config/saasMigration");
    await runSaaSMigration();
    console.log("[STARTUP] SaaS migration complete");

    console.log("[STARTUP] Running SaaS Phase 2 migration...");
    const runPhase2Migration = require("./config/saasPhase2Migration");
    await runPhase2Migration();
    console.log("[STARTUP] SaaS Phase 2 migration complete");
  } catch (err) {
    // NON-FATAL: Log the error but do NOT kill the process.
    // The server must start even if DB is temporarily unreachable.
    // Migrations are idempotent and will succeed on next restart.
    console.error("[STARTUP] Migration failed (non-fatal, server will still start):", err.message);
  }

  app.listen(PORT, () => {
    logger.info(`
===================================
  Billing API Started
  PORT: ${PORT}
  MODE: ${process.env.NODE_ENV}
  DB_HOST: ${process.env.DB_HOST}
===================================
`);
  });
}

startServer();