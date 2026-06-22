exports.getTenantFilter = (req, tableAlias = "") => {
  const alias = tableAlias ? `${tableAlias}.` : "";
  let filterSql = "";
  let filterParams = [];
  let companyId = null;

  try {
    if (req.user?.role === "SuperAdmin") {
      const selectedCompanyId = req.headers["x-company-id"];
      if (selectedCompanyId) {
        filterSql = ` AND ${alias}company_id = ?`;
        filterParams = [selectedCompanyId];
        companyId = selectedCompanyId;
      }
    } else if (req.user) {
      filterSql = ` AND ${alias}company_id = ?`;
      filterParams = [req.user.company_id || null];
      companyId = req.user.company_id || null;
    }
  } catch (error) {
    console.error("Error in getTenantFilter:", error);
  }

  return { filterSql, filterParams, companyId };
};

exports.getInsertCompanyId = (req) => {
  if (req.user?.role === "SuperAdmin") {
    return req.headers["x-company-id"] || null;
  }
  return req.user?.company_id || null;
};
