import { createHmac, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export function createOpaqueToken(prefix: string, byteLength = 24): string {
  return `${prefix}_${randomBytes(byteLength).toString("base64url")}`;
}

export function hashValue(value: string): string {
  return createHmac("sha256", env.BIRDLOUD_HASH_SECRET).update(value).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

