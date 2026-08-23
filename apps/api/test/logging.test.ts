import { describe, expect, it } from "vitest";
import { serializeRequestForLog } from "../src/app.js";

describe("request log privacy", () => {
  it("logs a normalized route without query tokens, receipts, or network identifiers", () => {
    const serialized = serializeRequestForLog({
      method: "GET",
      url: "/api/campaigns/campaign-id/receipts/raw-secret-receipt?token=raw-email-token",
      routeOptions: {
        url: "/api/campaigns/:campaignId/receipts/:receipt"
      },
      ip: "203.0.113.10",
      headers: {
        "user-agent": "private-user-agent"
      }
    } as Parameters<typeof serializeRequestForLog>[0]);

    expect(serialized).toEqual({
      method: "GET",
      route: "/api/campaigns/:campaignId/receipts/:receipt"
    });
    expect(JSON.stringify(serialized)).not.toContain("raw-secret-receipt");
    expect(JSON.stringify(serialized)).not.toContain("raw-email-token");
    expect(JSON.stringify(serialized)).not.toContain("203.0.113.10");
    expect(JSON.stringify(serialized)).not.toContain("private-user-agent");
  });
});
