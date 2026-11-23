const request = require("supertest");
const app = require("./server");

describe("FlySkyMods API", () => {
  test("GET /api/health returns status ok", async () => {
    const res = await request(app).get("/api/health");

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.app).toBe("FlySkyMods");
  });
});