// Loads variables from a local .env file into process.env (ignored by Git)
require("dotenv").config({ quiet: true });

const express = require("express");
const cookieParser = require("cookie-parser");
const { connectDB, getDbStatus, isDbConnected } = require("./db");
const Product = require("./models/Product");
const { isStorageConfigured } = require("./storage");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const storeRoutes = require("./routes/store");

const app = express();
const PORT = process.env.PORT || 3000;

// Lets the server read JSON sent in request bodies
app.use(express.json());

// Lets the server read cookies (used for the login token)
app.use(cookieParser());

// Hostinger runs the app behind a proxy; trust it for HTTPS detection
app.set("trust proxy", 1);

// Serves files from the public/ folder (Satvik's frontend) once they exist
app.use(express.static("public"));

// ---- NEW: in-memory mod data ----
// Sample mods (prices in ₹). Used when MongoDB is not connected (e.g. tests),
// and copied into MongoDB the first time the database is empty.
const mods = [
  { id: 1, name: "A320 Neo Pro", version: "2.1", category: "Aircraft", price: 1999, developer: "SkyForge Studios", description: "Detailed Airbus A320 with custom cockpit systems.", rating: 4.8, downloads: 15230 },
  { id: 2, name: "Boeing 747 Classic", version: "1.4", category: "Aircraft", price: 2499, developer: "AeroWorks", description: "Classic jumbo jet with realistic flight model.", rating: 4.6, downloads: 9800 },
  { id: 3, name: "Pacific Airways Livery Pack", version: "1.0", category: "Liveries", price: 0, developer: "LiveryHub", description: "Free pack of 12 airline liveries.", rating: 4.2, downloads: 22100 },
  { id: 4, name: "London Heathrow Extreme", version: "3.0", category: "Airports", price: 1599, developer: "Terminal Studios", description: "Highly detailed EGLL with animated ground traffic.", rating: 4.7, downloads: 12450 },
  { id: 5, name: "Swiss Alps Scenery", version: "1.2", category: "Scenery", price: 1199, developer: "AlpineVision", description: "Enhanced mountain terrain and landmarks.", rating: 4.5, downloads: 7600 },
  { id: 6, name: "Flight Planner Utility", version: "5.3", category: "Utilities", price: 0, developer: "NavTools", description: "Free route planning and navigation tool.", rating: 4.4, downloads: 31200 },
  { id: 7, name: "Realistic Clouds Enhancer", version: "2.0", category: "Enhancements", price: 799, developer: "SkyVisuals", description: "Improves cloud textures and weather visuals.", rating: 4.3, downloads: 18900 },
  { id: 8, name: "Cessna 172 HD Panel", version: "1.1", category: "Aircraft", price: 0, developer: "GA Mods", description: "Free HD cockpit upgrade for the Cessna 172.", rating: 4.1, downloads: 14050 }
];

// Allowed mod categories
const CATEGORIES = ["Aircraft", "Liveries", "Airports", "Scenery", "Utilities", "Enhancements"];

// Checks new mod data and returns a list of error messages (empty list = valid)
function validateMod(data) {
  const errors = [];
  const requiredText = ["name", "category", "developer", "description"];

  requiredText.forEach((field) => {
    if (typeof data[field] !== "string" || data[field].trim() === "") {
      errors.push(`${field} is required`);
    }
  });

  if (data.category && !CATEGORIES.includes(data.category)) {
    errors.push(`category must be one of: ${CATEGORIES.join(", ")}`);
  }

  if (typeof data.price !== "number" || data.price < 0) {
    errors.push("price must be a number 0 or greater");
  }

  return errors;
}

/**
 * Turns ?category=&search=&price= into a MongoDB filter.
 * Search text is escaped so characters like "(" cannot break the regex.
 */
function buildProductFilter({ category, search, price }) {
  const filter = {};
  const escape = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (category) {
    filter.category = new RegExp(`^${escape(category)}$`, "i");
  }
  if (search) {
    const term = new RegExp(escape(search), "i");
    filter.$or = [{ name: term }, { description: term }, { developer: term }];
  }
  if (price === "free") filter.price = 0;
  if (price === "paid") filter.price = { $gt: 0 };

  return filter;
}

// Health check route: confirms the server is alive
// Also reports whether user accounts can work (database + JWT secret),
// so problems after a deployment are easy to diagnose. No secrets are shown.
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "FlySkyMods",
    accounts: {
      ...getDbStatus(),
      jwtSecret: Boolean(process.env.JWT_SECRET)
    },
    files: { storage: isStorageConfigured() }
  });
});

// Returns all mods. Optional filters:
//   /api/mods?category=Aircraft
//   /api/mods?search=a320
//   /api/mods?category=Aircraft&search=boeing
//   /api/mods?price=free   or   /api/mods?price=paid
app.get("/api/mods", async (req, res) => {
  const { category, search, price } = req.query;

  // Database connected: read products from MongoDB
  if (isDbConnected()) {
    const products = await Product.find(buildProductFilter(req.query)).sort({ productId: 1 });
    return res.json(products.map((product) => product.toPublicJSON()));
  }

  // No database (tests / offline): use the sample list
  let result = mods;

  if (category) {
    result = result.filter(
      (m) => m.category.toLowerCase() === category.toLowerCase()
    );
  }

  if (search) {
    const term = search.toLowerCase();
    result = result.filter(
      (m) =>
        m.name.toLowerCase().includes(term) ||
        m.description.toLowerCase().includes(term) ||
        m.developer.toLowerCase().includes(term)
    );
  }

  if (price === "free") {
    result = result.filter((m) => m.price === 0);
  } else if (price === "paid") {
    result = result.filter((m) => m.price > 0);
  }

  res.json(result);
});

// Product picture (stored in MongoDB). The URL contains ?v=<last update>,
// so browsers may cache it; a new upload gets a new URL.
app.get("/api/mods/:id/image", async (req, res) => {
  const id = Number(req.params.id);
  const product = isDbConnected() && Number.isInteger(id)
    ? await Product.findOne({ productId: id, hasImage: true }).select("+image.data +image.contentType")
    : null;

  if (!product || !product.image || !product.image.data) {
    return res.status(404).json({ error: "Image not found" });
  }

  res.set("Content-Type", product.image.contentType);
  res.set("Cache-Control", "public, max-age=86400");
  res.send(product.image.data);
});

// NEW: returns one mod by its id, or 404 if it doesn't exist
app.get("/api/mods/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (isDbConnected()) {
    const product = Number.isInteger(id) ? await Product.findOne({ productId: id }) : null;
    if (!product) {
      return res.status(404).json({ error: "Mod not found" });
    }
    return res.json(product.toPublicJSON());
  }

  const mod = mods.find((m) => m.id === id);

  if (!mod) {
    return res.status(404).json({ error: "Mod not found" });
  }

  res.json(mod);
});

// Creates a new mod from the JSON request body
app.post("/api/mods", (req, res) => {
  // With the database connected, products are managed only by admins
  // through the admin dashboard (POST /api/admin/products).
  if (isDbConnected()) {
    return res.status(403).json({ error: "Products are managed from the admin dashboard" });
  }

  const body = req.body || {};
  const { name, category, price, developer, description } = body;

  const errors = validateMod(body);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Invalid mod data", details: errors });
  }

  const newMod = {
    id: mods.length ? Math.max(...mods.map((m) => m.id)) + 1 : 1,
    name: name.trim(),
    category,
    price,
    developer: developer.trim(),
    description: description.trim(),
    rating: 0,
    downloads: 0
  };

  mods.push(newMod);
  res.status(201).json(newMod);
});

// User accounts: register, login, logout, me
app.use("/api/auth", authRoutes);

// Admin-only routes (checked on the server for every request)
app.use("/api/admin", adminRoutes);

// Customer store routes: coupons, purchase requests, downloads
app.use("/api", storeRoutes);

// Any /api request that did not match a route above gets a JSON 404
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// Error handler: runs when something throws or express.json() gets broken JSON.
// It has 4 parameters (err, req, res, next) - that is how Express knows it handles errors.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON in request body" });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "File is too large" });
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// Connect to MongoDB as soon as the app is loaded.
// Hosting platforms like Hostinger import this file and start `app` themselves,
// so the connection must not depend on "node server.js" being used.
// Jest sets NODE_ENV=test - tests use their own in-memory database instead.
if (process.env.NODE_ENV !== "test") {
  connectDB(process.env.MONGODB_URI)
    .then(async (connected) => {
      if (!connected) return;
      // First run with an empty database: copy the sample mods in
      const added = await Product.seedIfEmpty(mods);
      if (added) console.log(`Added ${added} sample products to MongoDB`);
    })
    .catch((error) => {
      console.error("MongoDB connection failed:", error.message);
    });
}

// Only open a port ourselves when run directly with "node server.js" / npm start.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`FlySkyMods server running on http://localhost:${PORT}`);
  });
}

module.exports = app;