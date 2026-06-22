/**
 * Wraps async functions to catch any errors and forward them to the next middleware
 * @param {Function} fn - Async controller function
 * @returns {Function} Express middleware wrapper
 */
module.exports = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
