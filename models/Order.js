/* =========================================================
   FlySkyMods - Order model (MongoDB "orders" collection)
   A purchase request: the customer paid by UPI/bank and sent the
   transaction ID; an admin approves or rejects it.
   ========================================================= */
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },

    // A copy of the product details at the time of purchase
    productId: { type: Number, required: true },
    productName: { type: String, required: true },
    productVersion: { type: String, required: true },

    price: { type: Number, required: true },        // ₹ before discount
    couponCode: { type: String, default: null },
    discount: { type: Number, default: 0 },
    finalPrice: { type: Number, required: true },   // ₹ the customer paid

    paymentRef: { type: String, default: "" },      // UPI / bank transaction ID

    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    adminNote: { type: String, default: "" },
    decidedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

orderSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    userName: this.userName,
    userEmail: this.userEmail,
    productId: this.productId,
    productName: this.productName,
    productVersion: this.productVersion,
    price: this.price,
    couponCode: this.couponCode,
    discount: this.discount,
    finalPrice: this.finalPrice,
    paymentRef: this.paymentRef,
    status: this.status,
    adminNote: this.adminNote,
    decidedAt: this.decidedAt,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model("Order", orderSchema);
