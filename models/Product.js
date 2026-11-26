/* =========================================================
   FlySkyMods - Product model (MongoDB "products" collection)
   A product is a mod in the store: name, version, price (₹),
   picture (stored here) and download file (stored in Cloudflare R2).
   ========================================================= */
const mongoose = require("mongoose");

const CATEGORIES = ["Aircraft", "Liveries", "Airports", "Scenery", "Utilities", "Enhancements"];

const productSchema = new mongoose.Schema(
  {
    // Simple numeric id used in URLs (/api/mods/3), same style as before
    productId: { type: Number, required: true, unique: true },

    name: { type: String, required: true, trim: true, maxlength: 100 },
    version: { type: String, required: true, trim: true, maxlength: 30, default: "1.0" },
    category: { type: String, required: true, enum: CATEGORIES },
    price: { type: Number, required: true, min: 0 },          // in Indian Rupees, 0 = free
    developer: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    downloads: { type: Number, default: 0, min: 0 },

    // Picture: small image stored in MongoDB. select:false = not loaded
    // unless asked for, so product lists stay fast.
    image: {
      data: { type: Buffer, select: false },
      contentType: { type: String, select: false }
    },
    hasImage: { type: Boolean, default: false },

    // Download file: stored in Cloudflare R2, we only keep its key here
    file: {
      key: { type: String },
      name: { type: String },
      size: { type: Number }
    }
  },
  { timestamps: true }
);

/**
 * Data sent to the browser. Never includes the R2 file key or image bytes.
 */
productSchema.methods.toPublicJSON = function () {
  return {
    id: this.productId,
    name: this.name,
    version: this.version,
    category: this.category,
    price: this.price,
    developer: this.developer,
    description: this.description,
    rating: this.rating,
    downloads: this.downloads,
    imageUrl: this.hasImage ? `/api/mods/${this.productId}/image?v=${this.updatedAt.getTime()}` : null,
    hasFile: Boolean(this.file && this.file.key),
    fileName: this.file && this.file.key ? this.file.name : null,
    fileSize: this.file && this.file.key ? this.file.size : null,
    updatedAt: this.updatedAt
  };
};

/**
 * Next free numeric id (highest id + 1).
 */
productSchema.statics.nextProductId = async function () {
  const last = await this.findOne().sort({ productId: -1 }).select("productId");
  return last ? last.productId + 1 : 1;
};

/**
 * First start with an empty database: copy the sample mods in,
 * so the store is never empty.
 */
productSchema.statics.seedIfEmpty = async function (sampleMods) {
  if ((await this.estimatedDocumentCount()) > 0) return 0;

  await this.insertMany(
    sampleMods.map((mod) => ({
      productId: mod.id,
      name: mod.name,
      version: mod.version || "1.0",
      category: mod.category,
      price: mod.price,
      developer: mod.developer,
      description: mod.description,
      rating: mod.rating,
      downloads: mod.downloads
    }))
  );
  return sampleMods.length;
};

const Product = mongoose.model("Product", productSchema);
Product.CATEGORIES = CATEGORIES;

module.exports = Product;
