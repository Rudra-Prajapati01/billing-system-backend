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

// User-Requested Startup Logs
console.log("UPLOADS DIR:", uploadsDir);
console.log("UPLOADS ABSOLUTE:", path.resolve(uploadsDir));
console.log("UPLOADS EXISTS:", fs.existsSync(uploadsDir));
console.log("PARENT UPLOADS EXISTS:", fs.existsSync(path.join(__dirname, "../uploads")));

// Comprehensive production server audit route
app.get("/api/production-audit", async (req, res) => {
  try {
    const db = require("./config/db");
    const [profiles] = await db.query("SELECT id, company_name, logo, signature FROM company_profile");

    // Scan multiple potential uploads directories
    const potentialDirs = {
      currentDirUploads: path.resolve(path.join(__dirname, "uploads")),
      parentDirUploads: path.resolve(path.join(__dirname, "../uploads")),
      grandparentDirUploads: path.resolve(path.join(__dirname, "../../uploads")),
    };

    const directoriesInfo = {};
    const allPhysicalFiles = {};

    Object.keys(potentialDirs).forEach(key => {
      const dirPath = potentialDirs[key];
      const exists = fs.existsSync(dirPath);
      let files = [];
      if (exists) {
        try {
          files = fs.readdirSync(dirPath);
        } catch (e) {
          files = [`Error: ${e.message}`];
        }
      }
      directoriesInfo[key] = {
        path: dirPath,
        exists,
        filesCount: files.length,
        permissions: exists ? fs.statSync(dirPath).mode.toString(8) : null,
      };
      allPhysicalFiles[key] = files;
    });

    // Check where database files actually exist on disk
    const auditResults = profiles.map(profile => {
      const logoFilename = profile.logo ? path.basename(profile.logo) : null;
      const signatureFilename = profile.signature ? path.basename(profile.signature) : null;

      const logoLocations = {};
      const signatureLocations = {};

      Object.keys(potentialDirs).forEach(key => {
        const dirPath = potentialDirs[key];
        logoLocations[key] = logoFilename ? fs.existsSync(path.join(dirPath, logoFilename)) : false;
        signatureLocations[key] = signatureFilename ? fs.existsSync(path.join(dirPath, signatureFilename)) : false;
      });

      return {
        id: profile.id,
        companyName: profile.company_name,
        dbLogoPath: profile.logo,
        dbSignaturePath: profile.signature,
        logoFilename,
        signatureFilename,
        logoLocations,
        signatureLocations,
      };
    });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      directoriesInfo,
      allPhysicalFiles,
      databaseAudit: auditResults,
      processInfo: {
        cwd: process.cwd(),
        uid: process.uid ? process.uid : "N/A",
        gid: process.gid ? process.gid : "N/A",
        envNodeEnv: process.env.NODE_ENV
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack
    });
  }
});

// Custom uploads route searching in multiple directories
app.get("/uploads/:filename", (req, res, next) => {
  const filename = path.basename(req.params.filename);
  
  const potentialDirs = [
    path.join(__dirname, "uploads"),
    path.join(__dirname, "../uploads"),
    path.join(__dirname, "../../uploads"),
  ];

  let resolvedFilePath = null;

  for (const dir of potentialDirs) {
    const testPath = path.join(dir, filename);
    if (fs.existsSync(testPath)) {
      resolvedFilePath = testPath;
      break;
    }
  }

  // User-Requested Route Logs
  console.log("REQUESTED FILE:", resolvedFilePath || path.join(potentialDirs[0], filename));
  console.log("FILE EXISTS:", resolvedFilePath !== null);

  if (resolvedFilePath) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    return res.sendFile(resolvedFilePath, (err) => {
      if (err) {
        console.error("Error sending file:", err.message);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Error serving file",
            error: err.message,
          });
        }
      }
    });
  } else {
    return next();
  }
});

// Serve uploaded images through Express API with proper CORS/CORP headers
// to bypass CDN/web-server caching and static route hijack issues.
app.get("/api/uploads/:filename", (req, res, next) => {
  const filename = path.basename(req.params.filename);
  
  const potentialDirs = [
    path.join(__dirname, "uploads"),
    path.join(__dirname, "../uploads"),
    path.join(__dirname, "../../uploads"),
  ];

  let resolvedFilePath = null;

  for (const dir of potentialDirs) {
    const testPath = path.join(dir, filename);
    if (fs.existsSync(testPath)) {
      resolvedFilePath = testPath;
      break;
    }
  }

  // Debug logging
  console.log("REQUESTED API FILE:", resolvedFilePath || path.join(potentialDirs[0], filename));
  console.log("API FILE EXISTS:", resolvedFilePath !== null);

  if (resolvedFilePath) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    return res.sendFile(resolvedFilePath, (err) => {
      if (err) {
        console.error("Error sending API file:", err.message);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Error serving file",
            error: err.message,
          });
        }
      }
    });
  } else {
    return res.status(404).json({
      success: false,
      message: "Uploaded file not found",
    });
  }
});

// Endpoint to return uploads as Base64 JSON to bypass Hostinger CDN CORS filters completely
app.get("/api/logo-base64/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  
  const potentialDirs = [
    path.join(__dirname, "uploads"),
    path.join(__dirname, "../uploads"),
    path.join(__dirname, "../../uploads"),
  ];

  let resolvedFilePath = null;

  for (const dir of potentialDirs) {
    const testPath = path.join(dir, filename);
    if (fs.existsSync(testPath)) {
      resolvedFilePath = testPath;
      break;
    }
  }

  if (resolvedFilePath) {
    try {
      const fileBuffer = fs.readFileSync(resolvedFilePath);
      const ext = path.extname(filename).toLowerCase();
      let mimeType = "image/png"; // default
      if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
      else if (ext === ".gif") mimeType = "image/gif";
      else if (ext === ".webp") mimeType = "image/webp";

      const base64Data = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
      
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      
      return res.json({
        success: true,
        image: base64Data
      });
    } catch (err) {
      console.error("Error converting file to base64:", err.message);
      return res.status(500).json({
        success: false,
        message: "Failed to process image file",
        error: err.message
      });
    }
  } else {
    return res.status(404).json({
      success: false,
      message: "Image file not found"
    });
  }
});

// Fallback to express.static for any other requests under /uploads
app.use(
  "/uploads",
  express.static(uploadsDir, {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    }
  })
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

    console.log("[STARTUP] Running SaaS Phase 3 migration...");
    const runPhase3Migration = require("./config/saasPhase3Migration");
    await runPhase3Migration();
    console.log("[STARTUP] SaaS Phase 3 migration complete");
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