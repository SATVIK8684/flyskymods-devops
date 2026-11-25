/* =========================================================
   FlySkyMods - Admin API (admins only)
   GET /api/admin/users   list all registered users
   ========================================================= */
const express = require("express");
const User = require("../models/User");
const { requireAccounts, requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Every admin route: database available -> logged in -> role is admin.
// The SERVER checks this on every request; hiding buttons in the page is not security.
router.use(requireAccounts, requireAuth, requireAdmin);

router.get("/users", async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users.map((user) => user.toPublicJSON()));
});

module.exports = router;
