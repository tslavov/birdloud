import { Redis } from "ioredis";
import { env } from "../config/env.js";

let redis: Redis | undefined;

export function getRedis(): Redis {
  redis ??= new Redis(env.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: env.READINESS_TIMEOUT_MS,
    commandTimeout: env.READINESS_TIMEOUT_MS,
    maxRetriesPerRequest: 1
  });

  return redis;
}

export async function closeRedis(): Promise<void> {
  if (!redis) return;
  const client = redis;
  redis = undefined;

  if (client.status === "end") return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
