/* =========================================================
   FlySkyMods - Admin API (admins only)
   Users:     GET    /api/admin/users
   Products:  GET    /api/admin/products
              POST   /api/admin/products
              PUT    /api/admin/products/:id
              DELETE /api/admin/products/:id
              PUT    /api/admin/products/:id/image   (raw image body)
              DELETE /api/admin/products/:id/image
   ========================================================= */
const express = require("express");
const User = require("../models/User");
const Product = require("../models/Product");
const { requireAccounts, requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Every admin route: database available -> logged in -> role is admin.
// The SERVER checks this on every request; hiding buttons in the page is not security.
router.use(requireAccounts, requireAuth, requireAdmin);

/* ---------------- Users ---------------- */

router.get("/users", async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users.map((user) => user.toPublicJSON()));
});

/* ---------------- Products ---------------- */

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;   // 2 MB

/**
 * Checks product data from the admin form.
 * Returns { errors, data } where data only contains allowed fields.
 */
function validateProduct(body) {
  const errors = [];
  const data = {};
  const text = (field, max, label = field) => {
    const value = typeof body[field] === "string" ? body[field].trim() : "";
    if (!value) errors.push(`${label} is required`);
    else if (value.length > max) errors.push(`${label} must be at most ${max} characters`);
    data[field] = value;
  };

  text("name", 100);
  text("version", 30);
  text("developer", 80);
  text("description", 2000);

  if (!Product.CATEGORIES.includes(body.category)) {
    errors.push(`category must be one of: ${Product.CATEGORIES.join(", ")}`);
  }
  data.category = body.category;

  const price = Number(body.price);
  if (body.price === "" || body.price === null || !Number.isFinite(price) || price < 0 || price > 1000000) {
    errors.push("price must be a number from 0 to 1000000 (₹)");
  }
  data.price = Math.round(price);

  return { errors, data };
}

async function findProduct(req, res) {
  const id = Number(req.params.id);
  const product = Number.isInteger(id) ? await Product.findOne({ productId: id }) : null;
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return null;
  }
  return product;
}

router.get("/products", async (req, res) => {
  const products = await Product.find().sort({ productId: 1 });
  res.json(products.map((product) => product.toPublicJSON()));
});

router.post("/products", async (req, res) => {
  const { errors, data } = validateProduct(req.body || {});
  if (errors.length > 0) {
    return res.status(400).json({ error: "Invalid product data", details: errors });
  }

  const product = await Product.create({ ...data, productId: await Product.nextProductId() });
  res.status(201).json(product.toPublicJSON());
});

router.put("/products/:id", async (req, res) => {
  const product = await findProduct(req, res);
  if (!product) return;

  const { errors, data } = validateProduct(req.body || {});
  if (errors.length > 0) {
    return res.status(400).json({ error: "Invalid product data", details: errors });
  }

  Object.assign(product, data);
  await product.save();
  res.json(product.toPublicJSON());
});

router.delete("/products/:id", async (req, res) => {
  const product = await findProduct(req, res);
  if (!product) return;

  await product.deleteOne();
  res.json({ message: "Product deleted" });
});

/**
 * Upload a picture: the browser sends the image file itself as the
 * request body (Content-Type: image/png, image/jpeg or image/webp).
 */
router.put(
  "/products/:id/image",
  express.raw({ type: IMAGE_TYPES, limit: MAX_IMAGE_BYTES }),
  async (req, res) => {
    const product = await findProduct(req, res);
    if (!product) return;

    const contentType = (req.headers["content-type"] || "").split(";")[0];
    if (!IMAGE_TYPES.includes(contentType) || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "Upload a PNG, JPG or WebP image (max 2 MB)" });
    }

    product.image = { data: req.body, contentType };
    product.hasImage = true;
    await product.save();
    res.json(product.toPublicJSON());
  }
);

router.delete("/products/:id/image", async (req, res) => {
  const product = await findProduct(req, res);
  if (!product) return;

  product.image = undefined;
  product.hasImage = false;
  await product.save();
  res.json(product.toPublicJSON());
});

module.exports = router;
