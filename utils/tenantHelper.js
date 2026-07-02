exports.getTenantFilter = (req, tableAlias = "") => {
  const alias = tableAlias ? `${tableAlias}.` : "";
  let filterSql = "";
  let filterParams = [];
  let companyId = null;

  // Note: Permission check moved to business controllers via requireBusinessAccess
  if (req.user && req.user.role === "SuperAdmin" && !req.user.impersonation) {
    // Return empty filter so it doesn't crash non-business APIs
  }

  try {
    if (req.user && req.user.company_id) {
      filterSql = ` AND ${alias}company_id = ?`;
      filterParams = [req.user.company_id];
      companyId = req.user.company_id;
    } else {
      // If a non-SuperAdmin user somehow lacks a company_id, deny access.
      if (req.user && req.user.role !== "SuperAdmin") {
        const error = new Error("Access denied. No company context found.");
        error.statusCode = 403;
        throw error;
      }
      // For SuperAdmin without impersonation, use a safe default that won't match business rows
      // unless requireBusinessAccess blocks them first.
      filterSql = ` AND ${alias}company_id IS NULL`;
      filterParams = [];
    }
  } catch (error) {
    // If it already has a statusCode, rethrow it
    if (error.statusCode) throw error;
    console.error("Error in getTenantFilter:", error);
    throw new Error("Internal server error during tenant filtering.");
  }

  return { filterSql, filterParams, companyId };
};

exports.getInsertCompanyId = (req) => {
  return req.user?.company_id || null;
};

exports.requireBusinessAccess = (req) => {
  if (req.user && req.user.role === "SuperAdmin" && !req.user.impersonation) {
    if (req.method !== "GET") {
      const error = new Error("Super Admin cannot modify company business data directly.");
      error.statusCode = 403;
      throw error;
    }
    // For GET requests, allow it to pass. 
    // getTenantFilter will append 'company_id IS NULL' and return empty data natively.
  }
};
