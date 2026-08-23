import type { Redis } from "ioredis";
import { env } from "../config/env.js";

export type AbuseSignalKeyInput = {
  campaignId: string;
  ipHash?: string | undefined;
  deviceHash?: string | undefined;
};

export type AbuseSignalSnapshot = {
  available: boolean;
  recentIpSubmissions: number;
  recentDeviceSubmissions: number;
  recentIpFailures: number;
  recentDeviceFailures: number;
};

export type AbuseSignalStore = {
  observeVote(input: AbuseSignalKeyInput): Promise<AbuseSignalSnapshot>;
  recordFailure(input: AbuseSignalKeyInput): Promise<void>;
};

export type RedisAbuseSignalStoreConfig = {
  keyPrefix: string;
  ipWindowSeconds: number;
  deviceWindowSeconds: number;
  failureWindowSeconds: number;
};

const incrementWithTtlScript = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`;

export class RedisAbuseSignalStore implements AbuseSignalStore {
  constructor(
    private readonly redis: Redis,
    private readonly config: RedisAbuseSignalStoreConfig
  ) {}

  async observeVote(input: AbuseSignalKeyInput): Promise<AbuseSignalSnapshot> {
    try {
      const keys = buildKeys(this.config.keyPrefix, input);
      const [recentIpSubmissions, recentDeviceSubmissions, recentIpFailures, recentDeviceFailures] =
        await Promise.all([
          keys.ipSubmissions
            ? incrementWithTtl(this.redis, keys.ipSubmissions, this.config.ipWindowSeconds)
            : 0,
          keys.deviceSubmissions
            ? incrementWithTtl(
                this.redis,
                keys.deviceSubmissions,
                this.config.deviceWindowSeconds
              )
            : 0,
          keys.ipFailures ? readCount(this.redis, keys.ipFailures) : 0,
          keys.deviceFailures ? readCount(this.redis, keys.deviceFailures) : 0
        ]);

      return {
        available: true,
        recentIpSubmissions,
        recentDeviceSubmissions,
        recentIpFailures,
        recentDeviceFailures
      };
    } catch {
      return unavailableSnapshot();
    }
  }

  async recordFailure(input: AbuseSignalKeyInput): Promise<void> {
    try {
      const keys = buildKeys(this.config.keyPrefix, input);
      await Promise.all([
        keys.ipFailures
          ? incrementWithTtl(this.redis, keys.ipFailures, this.config.failureWindowSeconds)
          : undefined,
        keys.deviceFailures
          ? incrementWithTtl(this.redis, keys.deviceFailures, this.config.failureWindowSeconds)
          : undefined
      ]);
    } catch {
      // PostgreSQL remains authoritative. Redis outages must not hide the original vote outcome.
    }
  }
}

export function createAbuseSignalStore(redis: Redis): AbuseSignalStore {
  return new RedisAbuseSignalStore(redis, {
    keyPrefix: env.REDIS_KEY_PREFIX,
    ipWindowSeconds: env.ABUSE_IP_WINDOW_SECONDS,
    deviceWindowSeconds: env.ABUSE_DEVICE_WINDOW_SECONDS,
    failureWindowSeconds: env.ABUSE_FAILURE_WINDOW_SECONDS
  });
}

function buildKeys(prefix: string, input: AbuseSignalKeyInput) {
  const campaignPrefix = `${prefix}:campaign:${input.campaignId}`;

  return {
    ipSubmissions: input.ipHash
      ? `${campaignPrefix}:ip:${input.ipHash}:submissions`
      : undefined,
    deviceSubmissions: input.deviceHash
      ? `${campaignPrefix}:device:${input.deviceHash}:submissions`
      : undefined,
    ipFailures: input.ipHash ? `${campaignPrefix}:ip:${input.ipHash}:failures` : undefined,
    deviceFailures: input.deviceHash
      ? `${campaignPrefix}:device:${input.deviceHash}:failures`
      : undefined
  };
}

async function incrementWithTtl(redis: Redis, key: string, ttlSeconds: number): Promise<number> {
  const value = await redis.eval(incrementWithTtlScript, 1, key, String(ttlSeconds));
  return Number(value);
}

async function readCount(redis: Redis, key: string): Promise<number> {
  return Number((await redis.get(key)) ?? 0);
}

function unavailableSnapshot(): AbuseSignalSnapshot {
  return {
    available: false,
    recentIpSubmissions: 0,
    recentDeviceSubmissions: 0,
    recentIpFailures: 0,
    recentDeviceFailures: 0
  };
}
