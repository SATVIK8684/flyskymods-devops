/* =========================================================
   FlySkyMods - Authentication helpers and middleware
   ========================================================= */
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { isDbConnected } = require("../db");

// Name of the browser cookie that holds the login token
const COOKIE_NAME = "fsm_token";

// Logged-in sessions last 7 days
const TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Creates a signed JWT (JSON Web Token) containing the user's id.
 * The signature uses JWT_SECRET, so nobody can fake or edit a token.
 */
function createToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_LIFETIME_MS / 1000
  });
}

/**
 * Cookie settings:
 *  httpOnly - JavaScript in the page cannot read the token (protects against XSS)
 *  sameSite - the cookie is not sent from other websites' forms (protects against CSRF)
 *  secure   - only sent over HTTPS in production
 */
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TOKEN_LIFETIME_MS,
    path: "/"
  };
}

function setAuthCookie(res, user) {
  res.cookie(COOKIE_NAME, createToken(user), cookieOptions());
}

function clearAuthCookie(res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(COOKIE_NAME, options);
}

/**
 * Accounts need both a database and a JWT secret.
 * If either is missing, answer 503 (Service Unavailable) instead of crashing.
 */
function requireAccounts(req, res, next) {
  if (!process.env.JWT_SECRET || !isDbConnected()) {
    return res.status(503).json({ error: "User accounts are not available right now" });
  }
  next();
}

/**
 * Only lets the request continue if the user is logged in.
 * Puts the logged-in user into req.user for the next handler.
 */
async function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Please log in" });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    clearAuthCookie(res);
    return res.status(401).json({ error: "Your session has expired, please log in again" });
  }

  // Load the user fresh from the database, so deleted users or
  // changed roles take effect immediately
  const user = await User.findById(payload.sub);
  if (!user) {
    clearAuthCookie(res);
    return res.status(401).json({ error: "Please log in" });
  }

  req.user = user;
  next();
}

/**
 * Only lets admins continue. Must run after requireAuth.
 * 403 Forbidden = logged in, but not allowed.
 */
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  setAuthCookie,
  clearAuthCookie,
  requireAccounts,
  requireAuth,
  requireAdmin
};
