const request = require("supertest");
const app = require("./server");

describe("FlySkyMods API", () => {
  test("GET /api/health returns status ok", async () => {
    const res = await request(app).get("/api/health");

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.app).toBe("FlySkyMods");
  });

  test("GET /api/mods returns all mods", async () => {
    const res = await request(app).get("/api/mods");

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(8);
    expect(res.body[0]).toHaveProperty("name");
    expect(res.body[0]).toHaveProperty("category");
    expect(res.body[0]).toHaveProperty("price");
  });

  test("GET /api/mods/:id returns a single mod", async () => {
    const res = await request(app).get("/api/mods/1");

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.name).toBe("A320 Neo Pro");
  });

  test("GET /api/mods/:id returns 404 for a missing mod", async () => {
    const res = await request(app).get("/api/mods/999");

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("Mod not found");
  });

  test("POST /api/mods rejects invalid mod data", async () => {
    const res = await request(app)
      .post("/api/mods")
      .send({ name: "", category: "Boats", price: -5 });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid mod data");
    expect(res.body.details).toContain("name is required");
    expect(res.body.details).toContain("price must be a number 0 or greater");
  });

  test("GET /api/mods filters mods by category and search", async () => {
    const byCategory = await request(app).get("/api/mods?category=Aircraft");
    expect(byCategory.statusCode).toBe(200);
    expect(byCategory.body.length).toBe(3);
    byCategory.body.forEach((mod) => expect(mod.category).toBe("Aircraft"));

    const bySearch = await request(app).get("/api/mods?search=boeing");
    expect(bySearch.statusCode).toBe(200);
    expect(bySearch.body.length).toBe(1);
    expect(bySearch.body[0].name).toBe("Boeing 747 Classic");
  });
});