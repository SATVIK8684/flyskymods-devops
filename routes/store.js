/* =========================================================
   FlySkyMods - Store API for customers
   POST /api/coupons/check   { code, productId } -> discount and final price
   ========================================================= */
const express = require("express");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const { requireAccounts } = require("../middleware/auth");

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

module.exports = router;
module.exports.priceWithCoupon = priceWithCoupon;
