/* =========================================================
   FlySkyMods - User model (MongoDB "users" collection)
   ========================================================= */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// How many times bcrypt scrambles the password (higher = slower to crack)
const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },

    // unique: no two accounts can use the same email
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },

    // We NEVER store the real password, only its bcrypt hash
    passwordHash: { type: String, required: true },

    // "user" = normal customer, "admin" = can manage the store
    role: { type: String, enum: ["user", "admin"], default: "user" }
  },
  { timestamps: true }   // adds createdAt and updatedAt automatically
);

/**
 * Turns a plain password into a bcrypt hash, e.g. "pilot123" -> "$2b$10$..."
 */
userSchema.statics.hashPassword = function (password) {
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Checks a login attempt: true if the password matches the stored hash.
 */
userSchema.methods.checkPassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

/**
 * The only user data ever sent to the browser - no password hash.
 */
userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model("User", userSchema);
