/* =========================================================
   FlySkyMods - Account API
   POST /api/auth/register   create an account (always role "user")
   POST /api/auth/login      log in
   POST /api/auth/logout     log out
   GET  /api/auth/me         who is logged in?
   ========================================================= */
const express = require("express");
const User = require("../models/User");
const {
  setAuthCookie,
  clearAuthCookie,
  requireAccounts,
  requireAuth
} = require("../middleware/auth");

const router = express.Router();

// Every account route needs the database
router.use(requireAccounts);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Checks registration data and returns a list of error messages.
 */
function validateRegistration({ name, email, password }) {
  const errors = [];

  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 50) {
    errors.push("name must be 2 to 50 characters");
  }
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    errors.push("email must be a valid email address");
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    errors.push("password must be 8 to 128 characters");
  }

  return errors;
}

router.post("/register", async (req, res) => {
  const body = req.body || {};
  const errors = validateRegistration(body);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Invalid registration data", details: errors });
  }

  const email = body.email.trim().toLowerCase();
  if (await User.exists({ email })) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  // Public sign-up can never create an admin
  const user = await User.create({
    name: body.name.trim(),
    email,
    passwordHash: await User.hashPassword(body.password),
    role: "user"
  });

  setAuthCookie(res, user);
  res.status(201).json({ user: user.toPublicJSON() });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() });

  // Same message for "no such email" and "wrong password",
  // so attackers cannot find out which emails have accounts
  if (!user || !(await user.checkPassword(password))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  setAuthCookie(res, user);
  res.json({ user: user.toPublicJSON() });
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logged out" });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user.toPublicJSON() });
});

module.exports = router;
