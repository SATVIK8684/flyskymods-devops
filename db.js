/* =========================================================
   FlySkyMods - MongoDB connection (Mongoose)
   ========================================================= */
const mongoose = require("mongoose");

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

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");
  return true;
}

/**
 * true when Mongoose is connected (readyState 1 = connected).
 */
function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isDbConnected };
