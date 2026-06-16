import { Redis } from "ioredis";
import { env } from "../config/env.js";

let redis: Redis | undefined;

export function getRedis(): Redis {
  redis ??= new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  return redis;
}
