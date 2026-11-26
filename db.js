/* =========================================================
   FlySkyMods - MongoDB connection (Mongoose)
   ========================================================= */
const mongoose = require("mongoose");

// Last connection error, reported by GET /api/health (never contains secrets)
let lastConnectionError = null;

/**
 * Connects to MongoDB Atlas using the connection string from the
 * MONGODB_URI environment variable.
 * If it is not set, the website still runs (mods, search, filters),
 * only user accounts are unavailable until the database is configured.
 */
async function connectDB(uri) {
  if (!uri) {
    console.warn("MONGODB_URI is not set - user accounts are disabled until it is configured.");
    return false;
  }

  try {
    await mongoose.connect(uri);
    lastConnectionError = null;
    console.log("Connected to MongoDB");
    return true;
  } catch (error) {
    // Hide anything that looks like a connection string before storing the message
    lastConnectionError = String(error.message)
      .replace(/mongodb(\+srv)?:\/\/\S+/gi, "[connection string]")
      .slice(0, 150);
    throw error;
  }
}

/**
 * true when Mongoose is connected (readyState 1 = connected).
 */
function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Database status for the health check:
 * "not configured" | "connected" | "connecting" | "failed" | "disconnected"
 */
function getDbStatus() {
  if (!process.env.MONGODB_URI) return { database: "not configured" };
  if (isDbConnected()) return { database: "connected" };
  if (mongoose.connection.readyState === 2) return { database: "connecting" };
  if (lastConnectionError) return { database: "failed", reason: lastConnectionError };
  return { database: "disconnected" };
}

module.exports = { connectDB, isDbConnected, getDbStatus };
