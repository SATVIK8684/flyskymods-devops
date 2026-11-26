/* =========================================================
   FlySkyMods - Store API for customers
   POST /api/coupons/check   { code, productId } -> discount and final price
   GET  /api/store/payment-info               UPI details to show at checkout
   POST /api/orders          { productId, couponCode?, paymentRef }  (signed in)
   GET  /api/orders/mine     the signed-in customer's purchase requests
   ========================================================= */
const express = require("express");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const Order = require("../models/Order");
const { requireAccounts, requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * Finds a coupon and works out the price for one product.
 * Returns { error, status } or { coupon, product, discount, finalPrice }.
 * Shared by the coupon check and by purchase requests.
 */
async function priceWithCoupon(productId, code) {
  const id = Number(productId);
  const product = Number.isInteger(id) ? await Product.findOne({ productId: id }) : null;
  if (!product) return { status: 404, error: "Product not found" };

  if (!code) {
    return { product, coupon: null, discount: 0, finalPrice: product.price };
  }

  if (product.price === 0) return { status: 400, error: "Coupons are not needed for free mods" };

  const coupon = await Coupon.findOne({ code: String(code).trim().toUpperCase() });
  if (!coupon) return { status: 404, error: "Coupon code not found" };

  const problem = coupon.problem();
  if (problem) return { status: 400, error: problem };

  const discount = coupon.discountFor(product.price);
  return { product, coupon, discount, finalPrice: product.price - discount };
}

router.post("/coupons/check", requireAccounts, async (req, res) => {
  const { productId, code } = req.body || {};
  if (typeof code !== "string" || !code.trim()) {
    return res.status(400).json({ error: "Enter a coupon code" });
  }

  const result = await priceWithCoupon(productId, code);
  if (result.error) return res.status(result.status).json({ error: result.error });

  res.json({
    code: result.coupon.code,
    price: result.product.price,
    discount: result.discount,
    finalPrice: result.finalPrice
  });
});

/* ---------------- Checkout / purchase requests ---------------- */

// Where customers send the money. Set PAYMENT_UPI_ID in .env / Hostinger.
router.get("/store/payment-info", (req, res) => {
  res.json({
    upiId: process.env.PAYMENT_UPI_ID || null,
    payeeName: process.env.PAYMENT_NAME || "FlySkyMods"
  });
});

// UPI reference numbers / bank transaction IDs: letters, numbers, dashes
const PAYMENT_REF_PATTERN = /^[A-Za-z0-9-]{6,40}$/;

router.post("/orders", requireAccounts, requireAuth, async (req, res) => {
  const { productId, couponCode, paymentRef } = req.body || {};

  const result = await priceWithCoupon(productId, couponCode);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const { product, coupon, discount, finalPrice } = result;

  if (product.price === 0) {
    return res.status(400).json({ error: "This mod is free - no purchase needed" });
  }

  // A transaction ID is needed unless a coupon made it completely free
  const ref = typeof paymentRef === "string" ? paymentRef.trim() : "";
  if (finalPrice > 0 && !PAYMENT_REF_PATTERN.test(ref)) {
    return res.status(400).json({ error: "Enter your UPI / bank transaction ID (6-40 letters or numbers)" });
  }

  // Only one open or approved request per product per customer
  const existing = await Order.findOne({
    user: req.user._id,
    productId: product.productId,
    status: { $in: ["pending", "approved"] }
  });
  if (existing) {
    const message = existing.status === "approved"
      ? "You already own this mod"
      : "You already have a purchase request waiting for approval";
    return res.status(409).json({ error: message });
  }

  const order = await Order.create({
    user: req.user._id,
    userName: req.user.name,
    userEmail: req.user.email,
    productId: product.productId,
    productName: product.name,
    productVersion: product.version,
    price: product.price,
    couponCode: coupon ? coupon.code : null,
    discount,
    finalPrice,
    paymentRef: ref
  });

  res.status(201).json(order.toPublicJSON());
});

router.get("/orders/mine", requireAccounts, requireAuth, async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(orders.map((order) => order.toPublicJSON()));
});

module.exports = router;
module.exports.priceWithCoupon = priceWithCoupon;
