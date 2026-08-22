import "dotenv/config";
import { defineConfig } from "prisma/config";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://birdloud:birdloud@localhost:5433/birdloud_test";
process.env.DATABASE_URL ??= testDatabaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: testDatabaseUrl
  }
});
