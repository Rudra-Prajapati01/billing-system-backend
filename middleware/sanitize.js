/**
 * Strips HTML tags and angle brackets from a string to prevent XSS payloads
 * @param {string} str - Input string
 * @returns {string} Sanitized string
 */
const sanitizeString = (str) => {
  if (typeof str !== "string") return str;
  return str
    .replace(/<[^>]*>/g, "") // Strip HTML tags
    .replace(/[<>]/g, "");   // Strip loose angle brackets
};

/**
 * Recursively scans and sanitizes an object
 * @param {Object} obj - Input object / array
 * @returns {Object} Sanitized object
 */
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== "object") return obj;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (typeof obj[key] === "string") {
        obj[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === "object") {
        sanitizeObject(obj[key]);
      }
    }
  }
  return obj;
};

/**
 * Express middleware to sanitize body, query, and params for XSS prevention
 */
module.exports = (req, res, next) => {
  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);
  next();
};
