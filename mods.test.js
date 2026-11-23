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
});