const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Lets the server read JSON sent in request bodies
app.use(express.json());

// Serves files from the public/ folder (Satvik's frontend) once they exist
app.use(express.static("public"));

// Health check route: confirms the server is alive
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "FlySkyMods" });
});

// Only start listening when run directly with "node server.js".
// Tests will import `app` without opening a real port.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`FlySkyMods server running on http://localhost:${PORT}`);
  });
}

module.exports = app;