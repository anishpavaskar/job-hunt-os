import request from "supertest";
import app from "../src/app";

describe("GET /healthz", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("returns application/json content type", async () => {
    const res = await request(app).get("/healthz");
    expect(res.headers["content-type"]).toMatch(/json/);
  });

  it("is idempotent (same result on repeated calls)", async () => {
    const res1 = await request(app).get("/healthz");
    const res2 = await request(app).get("/healthz");
    expect(res1.body).toEqual(res2.body);
    expect(res1.status).toBe(res2.status);
  });
});

describe("GET /readyz", () => {
  it("returns 200 with status ready", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready" });
  });

  it("returns application/json content type", async () => {
    const res = await request(app).get("/readyz");
    expect(res.headers["content-type"]).toMatch(/json/);
  });
});

describe("404 fallback", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});
