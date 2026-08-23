import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    fileParallelism: false,
    env: {
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://birdloud:birdloud@localhost:5433/birdloud_test",
      TEST_REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379"
    }
  }
});
