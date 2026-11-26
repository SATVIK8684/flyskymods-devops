/* =========================================================
   FlySkyMods - Coupon model (MongoDB "coupons" collection)
   Example: code "SKY20", type "percent", value 20  -> 20% off
            code "FLAT500", type "fixed", value 500 -> ₹500 off
   ========================================================= */
const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, required: true, enum: ["percent", "fixed"] },
    value: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, default: null },     // null = never expires
    maxUses: { type: Number, default: null },     // null = unlimited
    uses: { type: Number, default: 0 },           // counted when an order is approved
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

/**
 * Returns a reason why this coupon cannot be used right now, or null if it can.
 */
couponSchema.methods.problem = function () {
  if (!this.active) return "This coupon is not active";
  if (this.expiresAt && this.expiresAt.getTime() < Date.now()) return "This coupon has expired";
  if (this.maxUses !== null && this.uses >= this.maxUses) return "This coupon has been fully used";
  return null;
};

/**
 * How many rupees this coupon takes off a price (never more than the price).
 */
couponSchema.methods.discountFor = function (price) {
  const discount = this.type === "percent"
    ? Math.round((price * this.value) / 100)
    : this.value;
  return Math.min(discount, price);
};

couponSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    code: this.code,
    type: this.type,
    value: this.value,
    expiresAt: this.expiresAt,
    maxUses: this.maxUses,
    uses: this.uses,
    active: this.active,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model("Coupon", couponSchema);
