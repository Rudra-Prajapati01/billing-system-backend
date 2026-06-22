const moment = require("moment");

/**
 * Helper to format log messages with standard timestamp and level tags
 */
const formatLog = (level, message) => {
  const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");
  return `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
};

const logger = {
  info: (message) => {
    console.log(formatLog("INFO", message));
  },
  warn: (message) => {
    console.warn(formatLog("WARN", message));
  },
  error: (message, err) => {
    console.error(formatLog("ERROR", message));
    if (err) {
      if (err.stack) {
        console.error(err.stack);
      } else {
        console.error(err);
      }
    }
  }
};

module.exports = logger;
