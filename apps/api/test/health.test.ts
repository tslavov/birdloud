import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("health routes", () => {
  it("returns API health", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "birdloud-api"
    });

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
