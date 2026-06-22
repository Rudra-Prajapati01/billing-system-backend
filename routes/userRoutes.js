const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { protect, superAdminOnly } = require("../middleware/authMiddleware");

// Require auth and SuperAdmin check for all user management paths
router.use(protect, superAdminOnly);

router
  .route("/")
  .get(userController.getUsers)
  .post(userController.createUser);

router
  .route("/:id")
  .put(userController.updateUser)
  .delete(userController.deleteUser);

module.exports = router;
