import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

const productionEnvironment = {
  NODE_ENV: "production",
  BETTER_AUTH_SECRET: "production-better-auth-secret-placeholder-for-test",
  BIRDLOUD_HASH_SECRET: "production-hash-secret-placeholder-for-test",
  BETTER_AUTH_URL: "https://api.example.test",
  CORS_ORIGIN: "https://vote.example.test",
  VOTER_VERIFY_BASE_URL: "https://vote.example.test",
  TURNSTILE_SECRET_KEY: "production-turnstile-placeholder-for-test",
  TURNSTILE_EXPECTED_HOSTNAME: "vote.example.test",
  TURNSTILE_EXPECTED_ACTION: "vote-submit"
};

describe("environment validation", () => {
  it("accepts a fully explicit HTTPS production configuration", () => {
    expect(() => parseEnv(productionEnvironment)).not.toThrow();
  });

  it("rejects placeholder secrets, public test Turnstile, and insecure production origins", () => {
    expect(() =>
      parseEnv({
        ...productionEnvironment,
        BETTER_AUTH_SECRET: "replace-with-local-development-secret",
        BIRDLOUD_HASH_SECRET: "replace-with-local-hash-secret",
        BETTER_AUTH_URL: "http://api.example.test",
        CORS_ORIGIN: "http://vote.example.test",
        VOTER_VERIFY_BASE_URL: "http://vote.example.test",
        TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
        TURNSTILE_EXPECTED_HOSTNAME: "",
        TURNSTILE_EXPECTED_ACTION: ""
      })
    ).toThrow();
  });
});
