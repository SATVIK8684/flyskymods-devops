/* =========================================================
   FlySkyMods - Admin API (admins only)
   Users:     GET    /api/admin/users
   Products:  GET    /api/admin/products
              POST   /api/admin/products
              PUT    /api/admin/products/:id
              DELETE /api/admin/products/:id
              PUT    /api/admin/products/:id/image   (raw image body)
              DELETE /api/admin/products/:id/image
   Coupons:   GET    /api/admin/coupons
              POST   /api/admin/coupons
              PATCH  /api/admin/coupons/:id   { active }
              DELETE /api/admin/coupons/:id
   ========================================================= */
const express = require("express");
const User = require("../models/User");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
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

/* ---------------- Coupons ---------------- */

const CODE_PATTERN = /^[A-Z0-9-]{3,20}$/;

function validateCoupon(body) {
  const errors = [];
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const value = Number(body.value);

  if (!CODE_PATTERN.test(code)) {
    errors.push("code must be 3-20 letters, numbers or dashes");
  }
  if (!["percent", "fixed"].includes(body.type)) {
    errors.push("type must be percent or fixed");
  }
  if (!Number.isFinite(value) || value < 1 ||
      (body.type === "percent" && value > 100) || value > 1000000) {
    errors.push(body.type === "percent" ? "percent must be 1 to 100" : "amount must be 1 to 1000000 (₹)");
  }

  let expiresAt = null;
  if (body.expiresAt) {
    expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) errors.push("expiry date is not valid");
  }

  let maxUses = null;
  if (body.maxUses !== undefined && body.maxUses !== null && body.maxUses !== "") {
    maxUses = Number(body.maxUses);
    if (!Number.isInteger(maxUses) || maxUses < 1) errors.push("max uses must be a whole number of 1 or more");
  }

  return { errors, data: { code, type: body.type, value: Math.round(value), expiresAt, maxUses } };
}

router.get("/coupons", async (req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  res.json(coupons.map((coupon) => coupon.toPublicJSON()));
});

router.post("/coupons", async (req, res) => {
  const { errors, data } = validateCoupon(req.body || {});
  if (errors.length > 0) {
    return res.status(400).json({ error: "Invalid coupon", details: errors });
  }
  if (await Coupon.exists({ code: data.code })) {
    return res.status(409).json({ error: "A coupon with this code already exists" });
  }

  const coupon = await Coupon.create(data);
  res.status(201).json(coupon.toPublicJSON());
});

// Switch a coupon on or off
router.patch("/coupons/:id", async (req, res) => {
  if (typeof (req.body || {}).active !== "boolean") {
    return res.status(400).json({ error: "active must be true or false" });
  }
  const coupon = await Coupon.findById(req.params.id).catch(() => null);
  if (!coupon) return res.status(404).json({ error: "Coupon not found" });

  coupon.active = req.body.active;
  await coupon.save();
  res.json(coupon.toPublicJSON());
});

router.delete("/coupons/:id", async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id).catch(() => null);
  if (!coupon) return res.status(404).json({ error: "Coupon not found" });
  res.json({ message: "Coupon deleted" });
});

module.exports = router;
