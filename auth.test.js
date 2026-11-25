/* =========================================================
   FlySkyMods - Account API tests
   Uses mongodb-memory-server: a temporary MongoDB that runs only
   during the tests, so CI never needs the real Atlas database.
   ========================================================= */
process.env.JWT_SECRET = "test-secret";

const os = require("os");
const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("./server");
const User = require("./models/User");

let mongo;

// The first run may download MongoDB, so allow extra time
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();

  // The MongoDB driver normally loads "os" with a dynamic import(), which
  // Jest does not support - so we hand it the os module directly.
  await mongoose.connect(mongo.getUri(), { runtimeAdapters: { os } });
}, 120000);

// Start every test with an empty users collection
afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const pilot = { name: "Test Pilot", email: "pilot@example.com", password: "secret123" };

describe("Account API", () => {
  test("POST /api/auth/register creates a user and never returns the password", async () => {
    const res = await request(app).post("/api/auth/register").send(pilot);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: "Test Pilot", email: "pilot@example.com", role: "user" });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    expect(res.headers["set-cookie"][0]).toMatch(/HttpOnly/);
  });

  test("POST /api/auth/register rejects invalid data and duplicate emails", async () => {
    const invalid = await request(app)
      .post("/api/auth/register")
      .send({ name: "X", email: "not-an-email", password: "123" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.details).toHaveLength(3);

    await request(app).post("/api/auth/register").send(pilot);
    const duplicate = await request(app).post("/api/auth/register").send(pilot);
    expect(duplicate.status).toBe(409);
  });

  test("public sign-up can never create an admin", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...pilot, role: "admin" });
    expect(res.body.user.role).toBe("user");
  });

  test("login with the right password works, wrong password returns 401", async () => {
    await request(app).post("/api/auth/register").send(pilot);

    const wrong = await request(app)
      .post("/api/auth/login")
      .send({ email: pilot.email, password: "wrong-password" });
    expect(wrong.status).toBe(401);

    const right = await request(app)
      .post("/api/auth/login")
      .send({ email: "PILOT@example.com", password: pilot.password });
    expect(right.status).toBe(200);
    expect(right.body.user.email).toBe(pilot.email);
  });

  test("GET /api/auth/me works while logged in and fails after logout", async () => {
    const agent = request.agent(app);   // keeps cookies like a browser
    await agent.post("/api/auth/register").send(pilot);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(pilot.email);

    await agent.post("/api/auth/logout");
    const afterLogout = await agent.get("/api/auth/me");
    expect(afterLogout.status).toBe(401);
  });

  test("GET /api/admin/users: 401 logged out, 403 for users, 200 for admins", async () => {
    expect((await request(app).get("/api/admin/users")).status).toBe(401);

    const user = request.agent(app);
    await user.post("/api/auth/register").send(pilot);
    expect((await user.get("/api/admin/users")).status).toBe(403);

    await User.create({
      name: "Admin",
      email: "admin@example.com",
      passwordHash: await User.hashPassword("adminpass123"),
      role: "admin"
    });
    const admin = request.agent(app);
    await admin.post("/api/auth/login").send({ email: "admin@example.com", password: "adminpass123" });

    const res = await admin.get("/api/admin/users");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });
});
