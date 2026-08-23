import type { FastifyInstance } from "fastify";

const healthResponseSchema = {
  type: "object",
  required: ["status", "service"],
  properties: {
    status: { type: "string", enum: ["ok"] },
    service: { type: "string" }
  }
} as const;

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/health",
    {
      schema: {
        operationId: "getHealth",
        summary: "Get API health",
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
}
