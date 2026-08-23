import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("health routes", () => {
  it("returns API health", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        "x-request-id": "health-test-request"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "birdloud-api"
    });
    expect(response.headers["x-request-id"]).toBe("health-test-request");

    await app.close();
  });

  it("reports dependency readiness without exposing dependency errors", async () => {
    const readyApp = await buildApp({
      readinessChecks: {
        async database() {},
        async redis() {}
      }
    });
    const ready = await readyApp.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({
      status: "ready",
      service: "birdloud-api",
      checks: {
        database: "ok",
        redis: "ok"
      }
    });
    await readyApp.close();

    const unavailableApp = await buildApp({
      readinessChecks: {
        async database() {
          throw new Error("private database detail");
        },
        async redis() {}
      }
    });
    const unavailable = await unavailableApp.inject({ method: "GET", url: "/ready" });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({
      status: "not_ready",
      service: "birdloud-api",
      checks: {
        database: "error",
        redis: "ok"
      }
    });
    expect(unavailable.body).not.toContain("private database detail");
    await unavailableApp.close();
  });

  it("replaces malformed external request IDs", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        "x-request-id": "bad request id with spaces"
      }
    });

    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    await app.close();
  });

  it("exposes OpenAPI JSON", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/docs/json"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().info.title).toBe("BirdLoud API");

    await app.close();
  });
});
