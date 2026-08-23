import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { RedisAbuseSignalStore } from "../src/services/abuse-signals.js";

describe("RedisAbuseSignalStore", () => {
  it("degrades to an unavailable snapshot and never replaces the vote error", async () => {
    const redis = {
      eval: vi.fn(async () => {
        throw new Error("Redis unavailable");
      }),
      get: vi.fn(async () => {
        throw new Error("Redis unavailable");
      })
    } as unknown as Redis;
    const store = new RedisAbuseSignalStore(redis, {
      keyPrefix: "birdloud:test",
      ipWindowSeconds: 60,
      deviceWindowSeconds: 60,
      failureWindowSeconds: 60
    });
    const input = {
      campaignId: "00000000-0000-4000-8000-000000000001",
      ipHash: "a".repeat(64),
      deviceHash: "b".repeat(64)
    };

    await expect(store.observeVote(input)).resolves.toEqual({
      available: false,
      recentIpSubmissions: 0,
      recentDeviceSubmissions: 0,
      recentIpFailures: 0,
      recentDeviceFailures: 0
    });
    await expect(store.recordFailure(input)).resolves.toBeUndefined();
  });
});
