const logger = require("../utils/logger");

/**
 * Express global error handling middleware
 */
module.exports = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  
  // Log the complete error stack in server console
  logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, err);

  const isProduction = process.env.NODE_ENV === "production";

  // If the error code is 4xx (client error), it's safe to expose to the client.
  // In production, generic 500 internal errors are masked to prevent DB schema/impl leaks.
  const isClientError = statusCode >= 400 && statusCode < 500;
  const safeMessage = isClientError || !isProduction 
    ? err.message 
    : "An unexpected internal server error occurred. Please contact support.";

  res.status(statusCode).json({
    success: false,
    message: safeMessage,
    ...(isProduction ? {} : { stack: err.stack })
  });
};
