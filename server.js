const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Lets the server read JSON sent in request bodies
app.use(express.json());

// Serves files from the public/ folder (Satvik's frontend) once they exist
app.use(express.static("public"));

// ---- NEW: in-memory mod data ----
const mods = [
  { id: 1, name: "A320 Neo Pro", category: "Aircraft", price: 24.99, developer: "SkyForge Studios", description: "Detailed Airbus A320 with custom cockpit systems.", rating: 4.8, downloads: 15230 },
  { id: 2, name: "Boeing 747 Classic", category: "Aircraft", price: 29.99, developer: "AeroWorks", description: "Classic jumbo jet with realistic flight model.", rating: 4.6, downloads: 9800 },
  { id: 3, name: "Pacific Airways Livery Pack", category: "Liveries", price: 0, developer: "LiveryHub", description: "Free pack of 12 airline liveries.", rating: 4.2, downloads: 22100 },
  { id: 4, name: "London Heathrow Extreme", category: "Airports", price: 19.99, developer: "Terminal Studios", description: "Highly detailed EGLL with animated ground traffic.", rating: 4.7, downloads: 12450 },
  { id: 5, name: "Swiss Alps Scenery", category: "Scenery", price: 14.99, developer: "AlpineVision", description: "Enhanced mountain terrain and landmarks.", rating: 4.5, downloads: 7600 },
  { id: 6, name: "Flight Planner Utility", category: "Utilities", price: 0, developer: "NavTools", description: "Free route planning and navigation tool.", rating: 4.4, downloads: 31200 },
  { id: 7, name: "Realistic Clouds Enhancer", category: "Enhancements", price: 9.99, developer: "SkyVisuals", description: "Improves cloud textures and weather visuals.", rating: 4.3, downloads: 18900 },
  { id: 8, name: "Cessna 172 HD Panel", category: "Aircraft", price: 0, developer: "GA Mods", description: "Free HD cockpit upgrade for the Cessna 172.", rating: 4.1, downloads: 14050 }
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

// Health check route: confirms the server is alive
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "FlySkyMods" });
});

// Returns all mods. Optional filters:
//   /api/mods?category=Aircraft
//   /api/mods?search=a320
//   /api/mods?category=Aircraft&search=boeing
//   /api/mods?price=free   or   /api/mods?price=paid
app.get("/api/mods", (req, res) => {
  const { category, search, price } = req.query;

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

// NEW: returns one mod by its id, or 404 if it doesn't exist
app.get("/api/mods/:id", (req, res) => {
  const id = Number(req.params.id);
  const mod = mods.find((m) => m.id === id);

  if (!mod) {
    return res.status(404).json({ error: "Mod not found" });
  }

  res.json(mod);
});

// Creates a new mod from the JSON request body
app.post("/api/mods", (req, res) => {
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

// Any /api request that did not match a route above gets a JSON 404
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// Only start listening when run directly with "node server.js".
// Tests will import `app` without opening a real port.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`FlySkyMods server running on http://localhost:${PORT}`);
  });
}

module.exports = app;