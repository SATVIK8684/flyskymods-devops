/* =========================================================
   FlySkyMods - Store tests: products, coupons, purchases, downloads
   Uses an in-memory MongoDB. R2 uses fake keys: download links are
   signed locally, so no real Cloudflare account is needed in CI.
   ========================================================= */
process.env.JWT_SECRET = "test-secret";
Object.assign(process.env, {
  R2_ACCOUNT_ID: "test-account",
  R2_ACCESS_KEY_ID: "test-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  R2_BUCKET: "test-bucket"
});

const os = require("os");
const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("./server");
const User = require("./models/User");
const Product = require("./models/Product");
const Coupon = require("./models/Coupon");
const Order = require("./models/Order");

let mongo;
let admin;
let customer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  // Jest cannot handle the driver's dynamic import("os"), so pass it directly
  await mongoose.connect(mongo.getUri(), { runtimeAdapters: { os } });
}, 120000);

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Product.deleteMany({}), Coupon.deleteMany({}), Order.deleteMany({})]);

  await User.create({
    name: "Store Admin",
    email: "admin@example.com",
    passwordHash: await User.hashPassword("adminpass123"),
    role: "admin"
  });
  admin = request.agent(app);
  await admin.post("/api/auth/login").send({ email: "admin@example.com", password: "adminpass123" });

  customer = request.agent(app);
  await customer.post("/api/auth/register").send({ name: "Test Pilot", email: "pilot@example.com", password: "secret123" });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const newProduct = {
  name: "Airbus A350",
  version: "1.2.0",
  category: "Aircraft",
  price: 2000,
  developer: "FlySkyMods",
  description: "Long-haul widebody airliner."
};

describe("Products", () => {
  test("admin can add, edit and delete a product with a version", async () => {
    const created = await admin.post("/api/admin/products").send(newProduct);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: 1, name: "Airbus A350", version: "1.2.0", price: 2000 });

    const updated = await admin.put("/api/admin/products/1").send({ ...newProduct, version: "1.3.0" });
    expect(updated.body.version).toBe("1.3.0");

    const list = await request(app).get("/api/mods");
    expect(list.body).toHaveLength(1);

    expect((await admin.delete("/api/admin/products/1")).status).toBe(200);
    expect((await request(app).get("/api/mods/1")).status).toBe(404);
  });

  test("customers cannot manage products and invalid data is rejected", async () => {
    expect((await customer.post("/api/admin/products").send(newProduct)).status).toBe(403);

    const invalid = await admin.post("/api/admin/products").send({ name: "", category: "Boats", price: -5 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.details.length).toBeGreaterThan(0);
  });

  test("admin can upload a product picture and it is served publicly", async () => {
    await admin.post("/api/admin/products").send(newProduct);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );

    const upload = await admin.put("/api/admin/products/1/image").set("Content-Type", "image/png").send(png);
    expect(upload.status).toBe(200);
    expect(upload.body.imageUrl).toMatch(/^\/api\/mods\/1\/image/);

    const image = await request(app).get(upload.body.imageUrl);
    expect(image.status).toBe(200);
    expect(image.headers["content-type"]).toBe("image/png");

    const notImage = await admin.put("/api/admin/products/1/image").set("Content-Type", "text/plain").send("hi");
    expect(notImage.status).toBe(400);
  });
});

describe("Coupons", () => {
  test("percent and fixed coupons calculate the right price", async () => {
    await admin.post("/api/admin/products").send(newProduct);
    await admin.post("/api/admin/coupons").send({ code: "sky20", type: "percent", value: 20 });
    await admin.post("/api/admin/coupons").send({ code: "BIG", type: "fixed", value: 5000 });

    const percent = await request(app).post("/api/coupons/check").send({ code: "SKY20", productId: 1 });
    expect(percent.body).toMatchObject({ code: "SKY20", discount: 400, finalPrice: 1600 });

    const fixed = await request(app).post("/api/coupons/check").send({ code: "big", productId: 1 });
    expect(fixed.body.finalPrice).toBe(0);   // never below zero
  });

  test("expired, inactive and duplicate coupons are rejected", async () => {
    await admin.post("/api/admin/products").send(newProduct);
    await admin.post("/api/admin/coupons").send({ code: "OLD", type: "fixed", value: 100, expiresAt: "2020-01-01" });
    const off = await admin.post("/api/admin/coupons").send({ code: "OFF10", type: "percent", value: 10 });
    await admin.patch(`/api/admin/coupons/${off.body.id}`).send({ active: false });

    const expired = await request(app).post("/api/coupons/check").send({ code: "OLD", productId: 1 });
    expect(expired.status).toBe(400);
    const inactive = await request(app).post("/api/coupons/check").send({ code: "OFF10", productId: 1 });
    expect(inactive.status).toBe(400);

    const duplicate = await admin.post("/api/admin/coupons").send({ code: "OLD", type: "fixed", value: 5 });
    expect(duplicate.status).toBe(409);
  });
});

describe("Purchase requests and downloads", () => {
  beforeEach(async () => {
    await Product.create({
      ...newProduct,
      productId: 1,
      file: { key: "mods/1/a350.zip", name: "a350.zip", size: 1000 }
    });
  });

  test("customer sends a purchase request and admin approves it", async () => {
    const order = await customer
      .post("/api/orders")
      .send({ productId: 1, paymentRef: "UPI-1234-5678" });
    expect(order.status).toBe(201);
    expect(order.body.status).toBe("pending");

    const duplicate = await customer.post("/api/orders").send({ productId: 1, paymentRef: "UPI-9999-0000" });
    expect(duplicate.status).toBe(409);

    // Customers cannot approve their own request
    expect((await customer.patch(`/api/admin/orders/${order.body.id}`).send({ status: "approved" })).status).toBe(403);

    const pending = await admin.get("/api/admin/orders?status=pending");
    expect(pending.body).toHaveLength(1);

    const approved = await admin.patch(`/api/admin/orders/${order.body.id}`).send({ status: "approved" });
    expect(approved.body.status).toBe("approved");

    const mine = await customer.get("/api/orders/mine");
    expect(mine.body[0].status).toBe("approved");
  });

  test("paid mods can only be downloaded after approval", async () => {
    expect((await request(app).get("/api/mods/1/download")).status).toBe(401);
    expect((await customer.get("/api/mods/1/download")).status).toBe(403);

    const order = await customer.post("/api/orders").send({ productId: 1, paymentRef: "UPI-1234-5678" });
    await admin.patch(`/api/admin/orders/${order.body.id}`).send({ status: "approved" });

    const download = await customer.get("/api/mods/1/download");
    expect(download.status).toBe(200);
    expect(download.body.fileName).toBe("a350.zip");
    expect(download.body.url).toMatch(/X-Amz-Signature=/);   // signed, short-lived R2 link
  });
});
