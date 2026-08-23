import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { MemoryOrganizerService } from "../support/memory-organizer-service.js";
import { MemoryVotingService } from "../support/memory-voting-service.js";

const redisUrl = process.env.TEST_REDIS_URL;
const redisDescribe = redisUrl ? describe : describe.skip;

redisDescribe("Redis-backed shared rate limiting", () => {
  const firstRedis = new Redis(redisUrl ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });
  const secondRedis = new Redis(redisUrl ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });
  const organizer = new MemoryOrganizerService();
  const voting = new MemoryVotingService(organizer);
  const organizerId = randomUUID();
  const remoteAddress = "198.51.100.247";
  let campaignId = "";

  beforeAll(async () => {
    await Promise.all([firstRedis.connect(), secondRedis.connect()]);
    const election = await organizer.createElection(organizerId, {
      title: "Shared Rate Limit Election"
    });
    await organizer.setElectionStatus(organizerId, election.id, "active");
    const campaign = await organizer.createCampaign(organizerId, election.id, {
      title: "Shared Rate Limit Campaign"
    });
    await organizer.setCampaignStatus(organizerId, campaign.id, "active");
    campaignId = campaign.id;
  });

  afterAll(async () => {
    const keys = await scanKeys(firstRedis, `${env.REDIS_KEY_PREFIX}:rate-limit:*${remoteAddress}*`);
    if (keys.length > 0) await firstRedis.del(...keys);
    await Promise.all([firstRedis.quit(), secondRedis.quit()]);
  });

  it("shares route limits across separate API instances", async () => {
    const firstApp = await buildApp({
      organizerService: organizer,
      votingService: voting,
      redis: firstRedis
    });
    for (let index = 0; index < 3; index += 1) {
      const response = await requestVerification(firstApp, campaignId, index, remoteAddress);
      expect(response.statusCode).toBe(202);
    }
    await firstApp.close();

    const secondApp = await buildApp({
      organizerService: organizer,
      votingService: voting,
      redis: secondRedis
    });
    for (let index = 3; index < 5; index += 1) {
      const response = await requestVerification(secondApp, campaignId, index, remoteAddress);
      expect(response.statusCode).toBe(202);
    }
    const limited = await requestVerification(secondApp, campaignId, 6, remoteAddress);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      error: {
        code: "RATE_LIMIT_EXCEEDED"
      }
    });
    await secondApp.close();
  });
});

function requestVerification(
  app: Awaited<ReturnType<typeof buildApp>>,
  campaignId: string,
  index: number,
  remoteAddress: string
) {
  return app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/identity/email/start`,
    remoteAddress,
    payload: {
      email: `shared-rate-limit-${index}@example.test`
    }
  });
}

async function scanKeys(redis: Redis, pattern: string): Promise<string[]> {
  let cursor = "0";
  const keys: string[] = [];
  do {
    const [nextCursor, page] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    keys.push(...page);
  } while (cursor !== "0");
  return keys;
}
