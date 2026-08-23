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
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  READINESS_TIMEOUT_MS: z.coerce.number().int().min(250).max(10000).default(1500),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  DATABASE_URL: z.string().url().default("postgresql://birdloud:birdloud@localhost:5432/birdloud"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  REDIS_KEY_PREFIX: z.string().min(1).max(64).default("birdloud:v1"),
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(10000).default(120),
  RATE_LIMIT_WINDOW: z.string().min(1).max(64).default("1 minute"),
  ABUSE_IP_WINDOW_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  ABUSE_DEVICE_WINDOW_SECONDS: z.coerce.number().int().min(60).max(7200).default(1800),
  ABUSE_FAILURE_WINDOW_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  BETTER_AUTH_SECRET: z.string().min(16).default("replace-with-local-development-secret"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:4000"),
  BIRDLOUD_HASH_SECRET: z.string().min(16).default("replace-with-local-hash-secret"),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
  TURNSTILE_SECRET_KEY: z.string().min(1).default("1x0000000000000000000000000000000AA"),
  TURNSTILE_EXPECTED_HOSTNAME: optionalNonEmptyString,
  TURNSTILE_EXPECTED_ACTION: optionalNonEmptyString,
  TURNSTILE_TIMEOUT_MS: z.coerce.number().int().min(500).max(10000).default(3000),
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

  if (
    value.NODE_ENV === "production" &&
    value.TURNSTILE_SECRET_KEY === "1x0000000000000000000000000000000AA"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["TURNSTILE_SECRET_KEY"],
      message: "Production must use a real Turnstile secret key."
    });
  }

  if (value.NODE_ENV === "production" && !value.TURNSTILE_EXPECTED_HOSTNAME) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["TURNSTILE_EXPECTED_HOSTNAME"],
      message: "Production must configure the expected Turnstile hostname."
    });
  }

  if (value.NODE_ENV === "production" && !value.TURNSTILE_EXPECTED_ACTION) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["TURNSTILE_EXPECTED_ACTION"],
      message: "Production must configure the expected Turnstile action."
    });
  }

  if (
    value.NODE_ENV === "production" &&
    value.BETTER_AUTH_SECRET === "replace-with-local-development-secret"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["BETTER_AUTH_SECRET"],
      message: "Production must use a unique Better Auth secret."
    });
  }

  if (
    value.NODE_ENV === "production" &&
    value.BIRDLOUD_HASH_SECRET === "replace-with-local-hash-secret"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["BIRDLOUD_HASH_SECRET"],
      message: "Production must use a unique hash secret."
    });
  }

  for (const key of ["BETTER_AUTH_URL", "CORS_ORIGIN", "VOTER_VERIFY_BASE_URL"] as const) {
    if (value.NODE_ENV === "production" && new URL(value[key]).protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `Production ${key} must use HTTPS.`
      });
    }
  }
});

export function parseEnv(input: NodeJS.ProcessEnv) {
  return envSchema.parse(input);
}

export const env = parseEnv(process.env);
