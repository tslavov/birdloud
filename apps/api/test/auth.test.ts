import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryOrganizerService } from "./support/memory-organizer-service.js";
import { MemoryVotingService } from "./support/memory-voting-service.js";
import { TestAuthService } from "./support/test-auth-service.js";

function buildTestApp(authService: TestAuthService) {
  const organizerService = new MemoryOrganizerService();

  return buildApp({
    authService,
    organizerService,
    votingService: new MemoryVotingService(organizerService)
  });
}

describe("Better Auth routes", () => {
  it("forwards auth requests and response cookies through Fastify", async () => {
    const responseHeaders = new Headers({
      "content-type": "application/json"
    });
    responseHeaders.append("set-cookie", "session=first; Path=/; HttpOnly");
    responseHeaders.append("set-cookie", "csrf=second; Path=/; SameSite=Lax");
    const authService = new TestAuthService(null, async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: responseHeaders
      })
    );
    const app = await buildTestApp(authService);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: {
        email: "organizer@example.test",
        password: "safe-test-password"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ ok: true });
    expect(response.headers["set-cookie"]).toEqual([
      "session=first; Path=/; HttpOnly",
      "csrf=second; Path=/; SameSite=Lax"
    ]);
    expect(authService.handledRequests).toHaveLength(1);
    expect(authService.handledRequests[0]?.url).toBe(
      "http://localhost:4000/api/auth/sign-in/email"
    );
    expect(await authService.handledRequests[0]?.json()).toEqual({
      email: "organizer@example.test",
      password: "safe-test-password"
    });

    await app.close();
  });

  it("returns the BirdLoud error envelope when the auth handler fails", async () => {
    const authService = new TestAuthService(null, async () => {
      throw new Error("synthetic auth failure");
    });
    const app = await buildTestApp(authService);

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/get-session"
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_FAILURE",
        message: "Authentication could not be completed.",
        details: {}
      }
    });

    await app.close();
  });
});
