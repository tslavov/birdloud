import type { FastifyInstance } from "fastify";

export type ReadinessChecks = {
  database(): Promise<unknown>;
  redis(): Promise<unknown>;
};

type ComponentStatus = "ok" | "error";

const healthResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "service"],
  properties: {
    status: { type: "string", enum: ["ok"] },
    service: { type: "string" }
  }
} as const;

const readinessResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "service", "checks"],
  properties: {
    status: { type: "string", enum: ["ready", "not_ready"] },
    service: { type: "string" },
    checks: {
      type: "object",
      additionalProperties: false,
      required: ["database", "redis"],
      properties: {
        database: { type: "string", enum: ["ok", "error"] },
        redis: { type: "string", enum: ["ok", "error"] }
      }
    }
  }
} as const;

export async function registerHealthRoutes(
  app: FastifyInstance,
  checks: ReadinessChecks,
  timeoutMs: number
): Promise<void> {
  app.get(
    "/health",
    {
      config: { rateLimit: false },
      schema: {
        operationId: "getHealth",
        summary: "Get API liveness",
        tags: ["system"],
        security: [],
        response: {
          200: healthResponseSchema
        }
      }
    },
    async () => ({
      status: "ok" as const,
      service: "birdloud-api"
    })
  );

  app.get(
    "/ready",
    {
      config: { rateLimit: false },
      schema: {
        operationId: "getReadiness",
        summary: "Check API dependencies",
        description: "Returns ready only when PostgreSQL and Redis both answer within the timeout.",
        tags: ["system"],
        security: [],
        response: {
          200: readinessResponseSchema,
          503: readinessResponseSchema
        }
      }
    },
    async (_request, reply) => {
      const [database, redis] = await Promise.all([
        componentCheck(checks.database, timeoutMs),
        componentCheck(checks.redis, timeoutMs)
      ]);
      const ready = database === "ok" && redis === "ok";
      return reply.status(ready ? 200 : 503).send({
        status: ready ? "ready" : "not_ready",
        service: "birdloud-api",
        checks: { database, redis }
      });
    }
  );
}

async function componentCheck(
  check: () => Promise<unknown>,
  timeoutMs: number
): Promise<ComponentStatus> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Readiness check timed out.")), timeoutMs);
        timeout.unref();
      })
    ]);
    return "ok";
  } catch {
    return "error";
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
