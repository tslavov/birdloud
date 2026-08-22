import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import type { AuthService } from "../lib/auth.js";

export async function registerAuthRoutes(
  app: FastifyInstance,
  authService: AuthService
): Promise<void> {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    schema: {
      hide: true
    },
    async handler(request, reply) {
      try {
        const response = await authService.handle(toWebRequest(request));

        reply.status(response.status);

        const setCookies = response.headers.getSetCookie();

        response.headers.forEach((value, key) => {
          if (key !== "set-cookie") {
            reply.header(key, value);
          }
        });

        if (setCookies.length > 0) {
          reply.header("set-cookie", setCookies);
        }

        return reply.send(response.body ? await response.text() : null);
      } catch (error) {
        request.log.error({ error }, "Better Auth request failed");
        return reply.status(500).send({
          error: {
            code: "AUTH_FAILURE",
            message: "Authentication could not be completed.",
            details: {}
          }
        });
      }
    }
  });
}

function toWebRequest(request: FastifyRequest): Request {
  const url = new URL(request.raw.url ?? request.url, env.BETTER_AUTH_URL);
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, String(value));
    }
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== undefined;

  return new Request(url, {
    method: request.method,
    headers,
    ...(hasBody ? { body: serializeBody(request.body) } : {})
  });
}

function serializeBody(body: unknown): string | Uint8Array {
  if (typeof body === "string" || body instanceof Uint8Array) {
    return body;
  }

  return JSON.stringify(body);
}
