import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/load/**/*.load.ts"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    env: {
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://birdloud:birdloud@localhost:5433/birdloud_test"
    }
  }
});
