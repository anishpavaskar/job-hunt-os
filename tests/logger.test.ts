import request from "supertest";
import app from "../src/app";

describe("Logger middleware", () => {
  let writeSpy: jest.SpyInstance;
  let logEntries: string[];

  beforeEach(() => {
    logEntries = [];
    writeSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        logEntries.push(chunk.toString());
        return true;
      });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("emits a JSON log line per request", async () => {
    await request(app).get("/healthz");
    expect(logEntries.length).toBeGreaterThanOrEqual(1);

    const parsed = JSON.parse(logEntries[0]);
    expect(parsed).toHaveProperty("timestamp");
    expect(parsed).toHaveProperty("level");
    expect(parsed).toHaveProperty("requestId");
    expect(parsed).toHaveProperty("method");
    expect(parsed).toHaveProperty("path");
    expect(parsed).toHaveProperty("status");
    expect(parsed).toHaveProperty("durationMs");
  });

  it("logs correct method, path, and status for /healthz", async () => {
    await request(app).get("/healthz");
    const parsed = JSON.parse(logEntries[0]);
    expect(parsed.method).toBe("GET");
    expect(parsed.path).toBe("/healthz");
    expect(parsed.status).toBe(200);
    expect(parsed.level).toBe("info");
  });

  it("logs warn level for 404 responses", async () => {
    await request(app).get("/nonexistent");
    const parsed = JSON.parse(logEntries[0]);
    expect(parsed.level).toBe("warn");
    expect(parsed.status).toBe(404);
  });

  it("includes requestId in log output", async () => {
    await request(app)
      .get("/healthz")
      .set("X-Request-Id", "test-request-123");
    const parsed = JSON.parse(logEntries[0]);
    expect(parsed.requestId).toBe("test-request-123");
  });

  it("generates a requestId when none provided", async () => {
    await request(app).get("/healthz");
    const parsed = JSON.parse(logEntries[0]);
    expect(parsed.requestId).toBeDefined();
    expect(parsed.requestId.length).toBeGreaterThan(0);
  });

  it("includes durationMs as a number", async () => {
    await request(app).get("/healthz");
    const parsed = JSON.parse(logEntries[0]);
    expect(typeof parsed.durationMs).toBe("number");
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("never logs request body or headers", async () => {
    await request(app)
      .get("/healthz")
      .set("Authorization", "Bearer secret-token")
      .set("Cookie", "session=abc");

    const raw = logEntries.join("");
    expect(raw).not.toContain("secret-token");
    expect(raw).not.toContain("session=abc");
    expect(raw).not.toContain("Authorization");
    expect(raw).not.toContain("Cookie");
  });
});
