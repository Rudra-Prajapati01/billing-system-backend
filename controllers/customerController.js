const db = require("../config/db");
const { getTenantFilter, requireBusinessAccess, getInsertCompanyId } = require("../utils/tenantHelper");

// Get All Customers
exports.getCustomers = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const { filterSql, filterParams } = getTenantFilter(req);
    const [rows] = await db.query(`SELECT * FROM customers WHERE 1=1 ${filterSql} ORDER BY id DESC`, filterParams);
    res.json(rows);
  } catch (err) {
    console.error("Error in getCustomers:", err);
    res.status(500).json({ error: "Failed to fetch customers", details: err.message });
  }
};

// Add Customer
exports.addCustomer = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const {
      customer_name,
      company_name,
      phone,
      email,
      address,
      city,
      state,
      country,
      gst_number,
    } = req.body;

    // Validation for required fields
    if (!customer_name || !company_name || !phone || !address || !city || !state) {
      return res.status(400).json({ error: "Required fields are missing" });
    }

    const companyId = getInsertCompanyId(req);

    const [result] = await db.query(
      `INSERT INTO customers (
        company_id,
        customer_name,
        company_name,
        phone,
        email,
        address,
        city,
        state,
        country,
        gst_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        customer_name.trim(),
        company_name.trim(),
        phone.trim(),
        email ? email.trim() : null,
        address.trim(),
        city.trim(),
        state.trim(),
        country ? country.trim() : "India",
        gst_number ? gst_number.trim() : null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Customer Added Successfully",
      customerId: result.insertId,
    });
  } catch (err) {
    console.error("Error in addCustomer:", err);
    res.status(500).json({ error: "Failed to add customer", details: err.message });
  }
};

// Update Customer
exports.updateCustomer = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const { id } = req.params;
    const {
      customer_name,
      company_name,
      phone,
      email,
      address,
      city,
      state,
      country,
      gst_number,
    } = req.body;

    // Validation for required fields
    if (!customer_name || !company_name || !phone || !address || !city || !state) {
      return res.status(400).json({ error: "Required fields are missing" });
    }

    const { filterSql, filterParams } = getTenantFilter(req);

    const [result] = await db.query(
      `UPDATE customers SET 
        customer_name = ?,
        company_name = ?,
        phone = ?,
        email = ?,
        address = ?,
        city = ?,
        state = ?,
        country = ?,
        gst_number = ?
       WHERE id = ? ${filterSql}`,
      [
        customer_name.trim(),
        company_name.trim(),
        phone.trim(),
        email ? email.trim() : null,
        address.trim(),
        city.trim(),
        state.trim(),
        country ? country.trim() : "India",
        gst_number ? gst_number.trim() : null,
        id,
        ...filterParams,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json({
      success: true,
      message: "Customer Updated Successfully",
    });
  } catch (err) {
    console.error("Error in updateCustomer:", err);
    res.status(500).json({ error: "Failed to update customer", details: err.message });
  }
};

// Delete Customer
exports.deleteCustomer = async (req, res) => {
  requireBusinessAccess(req);
  try {
    const { id } = req.params;
    const { filterSql, filterParams } = getTenantFilter(req);
    const [result] = await db.query(`DELETE FROM customers WHERE id = ? ${filterSql}`, [id, ...filterParams]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json({
      success: true,
      message: "Customer Deleted Successfully",
    });
  } catch (err) {
    console.error("Error in deleteCustomer:", err);
    res.status(500).json({ error: "Failed to delete customer", details: err.message });
  }
};