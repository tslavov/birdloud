import { PrismaClient, UserRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { createAuth, createBetterAuthService } from "../../src/lib/auth.js";
import { PrismaOrganizerService } from "../../src/services/organizer.js";
import { PrismaVotingService } from "../../src/services/voting.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;
const testEmail = "database-auth@example.test";

databaseDescribe("database-backed Better Auth", () => {
  const database = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl ?? "postgresql://birdloud:birdloud@localhost:5433/birdloud_test"
      }
    }
  });
  const databaseAuth = createAuth(database);
  const authService = createBetterAuthService(databaseAuth);

  beforeAll(async () => {
    await database.user.deleteMany({
      where: { email: testEmail }
    });
  });

  afterAll(async () => {
    await database.user.deleteMany({
      where: { email: testEmail }
    });
    await database.$disconnect();
  });

  it("signs up, signs in, and authorizes an organizer session cookie", async () => {
    const app = await buildApp({
      authService,
      organizerService: new PrismaOrganizerService(database),
      votingService: new PrismaVotingService(database)
    });

    const signUpResponse = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: {
        email: testEmail,
        password: "safe-database-test-password",
        name: "Database Test Organizer"
      }
    });

    expect(signUpResponse.statusCode).toBe(200);
    const setCookie = signUpResponse.headers["set-cookie"];
    const cookie = Array.isArray(setCookie) ? setCookie.map(firstCookiePart).join("; ") : firstCookiePart(setCookie);

    const organizerResponse = await app.inject({
      method: "GET",
      url: "/api/organizer/elections",
      headers: {
        cookie
      }
    });

    expect(organizerResponse.statusCode).toBe(200);
    expect(organizerResponse.json()).toEqual([]);

    const signOutResponse = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: {
        cookie
      }
    });
    expect(signOutResponse.statusCode).toBe(200);

    const signInResponse = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: {
        email: testEmail,
        password: "safe-database-test-password"
      }
    });
    expect(signInResponse.statusCode).toBe(200);

    const signInSetCookie = signInResponse.headers["set-cookie"];
    const signInCookie = Array.isArray(signInSetCookie)
      ? signInSetCookie.map(firstCookiePart).join("; ")
      : firstCookiePart(signInSetCookie);
    const signedInOrganizerResponse = await app.inject({
      method: "GET",
      url: "/api/organizer/elections",
      headers: {
        cookie: signInCookie
      }
    });
    expect(signedInOrganizerResponse.statusCode).toBe(200);

    const user = await database.user.findUniqueOrThrow({
      where: { email: testEmail }
    });
    expect(user.role).toBe(UserRole.ORGANIZER);
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/i);

    await app.close();
  });
});

function firstCookiePart(value: string | undefined): string {
  if (!value) {
    throw new Error("Better Auth did not return a session cookie.");
  }

  return value.split(";", 1)[0] ?? "";
}
