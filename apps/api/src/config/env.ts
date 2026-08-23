import "dotenv/config";
import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url().default("postgresql://birdloud:birdloud@localhost:5432/birdloud"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  BETTER_AUTH_SECRET: z.string().min(16).default("replace-with-local-development-secret"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:4000"),
  BIRDLOUD_HASH_SECRET: z.string().min(16).default("replace-with-local-hash-secret"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  TURNSTILE_SECRET_KEY: optionalNonEmptyString,
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().max(65535).default(1025),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  SMTP_USER: optionalNonEmptyString,
  SMTP_PASSWORD: optionalNonEmptyString,
  VOTER_EMAIL_FROM: z.string().min(3).default("BirdLoud <no-reply@birdloud.local>"),
  VOTER_VERIFY_BASE_URL: z.string().url().default("http://localhost:5173"),
  VOTER_EMAIL_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15)
}).superRefine((value, context) => {
  if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SMTP_USER and SMTP_PASSWORD must be configured together."
    });
  }
});

export const env = envSchema.parse(process.env);
