import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisAbuseSignalStore } from "../../src/services/abuse-signals.js";

const redisUrl = process.env.TEST_REDIS_URL;
const redisDescribe = redisUrl ? describe : describe.skip;

redisDescribe("Redis abuse signals", () => {
  const redis = new Redis(redisUrl ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });
  const prefix = `birdloud:test:${randomUUID()}`;
  const campaignId = randomUUID();
  const ipHash = "a".repeat(64);
  const deviceHash = "b".repeat(64);
  const store = new RedisAbuseSignalStore(redis, {
    keyPrefix: prefix,
    ipWindowSeconds: 60,
    deviceWindowSeconds: 120,
    failureWindowSeconds: 90
  });
  const campaignPrefix = `${prefix}:campaign:${campaignId}`;
  const keys = [
    `${campaignPrefix}:ip:${ipHash}:submissions`,
    `${campaignPrefix}:device:${deviceHash}:submissions`,
    `${campaignPrefix}:ip:${ipHash}:failures`,
    `${campaignPrefix}:device:${deviceHash}:failures`
  ];

  beforeAll(async () => {
    await redis.connect();
  });

  afterAll(async () => {
    await redis.del(...keys);
    await redis.quit();
  });

  it("atomically counts hashed campaign signals and attaches TTLs", async () => {
    const input = { campaignId, ipHash, deviceHash };
    expect(await store.observeVote(input)).toEqual({
      available: true,
      recentIpSubmissions: 1,
      recentDeviceSubmissions: 1,
      recentIpFailures: 0,
      recentDeviceFailures: 0
    });

    await store.recordFailure(input);
    await store.recordFailure(input);

    expect(await store.observeVote(input)).toEqual({
      available: true,
      recentIpSubmissions: 2,
      recentDeviceSubmissions: 2,
      recentIpFailures: 2,
      recentDeviceFailures: 2
    });

    const ttls = await Promise.all(keys.map((key) => redis.ttl(key)));
    expect(ttls.every((ttl) => ttl > 0)).toBe(true);
    expect(keys.join(" ")).not.toContain("203.0.113");
  });
});
