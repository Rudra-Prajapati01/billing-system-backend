const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();


if (!process.env.JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET environment variable is not defined in the .env file.");
  process.exit(1);
}


require("./config/dbInit");
require("./config/saasMigration")(); 
require("./config/saasPhase2Migration")(); 



const app = express();

app.use(cors());
app.use(express.json());

// Auto-create uploads directory
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Serve static uploads folder
app.use("/uploads", express.static(uploadsDir));

// Auth & User Routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

const userRoutes = require("./routes/userRoutes");
app.use("/api/users", userRoutes);

// Tenant Company Routes (SaaS)
const tenantCompanyRoutes = require("./routes/tenantCompanyRoutes");
app.use("/api/tenant-companies", tenantCompanyRoutes);
console.log("Tenant Company Routes Loaded Successfully");

// Routes
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

// ---> ADD THESE LINES FOR RECEIPTS <---
const receiptRoutes = require("./routes/receiptRoutes");
app.use("/api/receipts", receiptRoutes);

// Add this alongside your other routes
const customerReportRoutes = require("./routes/customerReportRoutes");
app.use("/api/customer-report", customerReportRoutes);

const leadRoutes = require("./routes/leadRoutes");
app.use("/api/leads", leadRoutes);

const dashboardRoutes = require("./routes/dashboardRoutes");
app.use("/api/dashboard", dashboardRoutes);

app.get("/", (req, res) => {
  res.send("Billing System API Running");
});


app.listen(5000, () => {
  console.log("Server running on port 5000");
});