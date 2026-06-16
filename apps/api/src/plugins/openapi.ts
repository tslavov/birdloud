import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "BirdLoud API",
        description: "API-first voting backend for the BirdLoud V1 platform.",
        version: "0.1.0"
      },
      tags: [
        { name: "system", description: "System health and readiness" }
      ]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });
}
