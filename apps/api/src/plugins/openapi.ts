import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import { OPEN_API_SCHEMAS } from "../openapi/schemas.js";

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    refResolver: {
      buildLocalReference(json, _baseUri, _fragment, index) {
        return typeof json.$id === "string" ? json.$id : `schema-${index}`;
      }
    },
    openapi: {
      info: {
        title: "BirdLoud API",
        description:
          "API-first voting backend for BirdLoud V1. Verified credentials and integrity controls limit and expose mass manipulation; they do not prove one real human can vote only once.",
        version: "0.1.0"
      },
      components: {
        securitySchemes: {
          cookieAuth: {
            type: "apiKey",
            in: "cookie",
            name: "better-auth.session_token",
            description:
              "Better Auth organizer/admin session cookie. Secure deployments may apply the standard secure-cookie prefix."
          }
        }
      },
      tags: [
        { name: "system", description: "System health and readiness" },
        { name: "organizer", description: "Session-authenticated organizer operations" },
        { name: "voter", description: "Public campaign, identity, voting, and receipt operations" }
      ]
    }
  });

  for (const schema of OPEN_API_SCHEMAS) {
    app.addSchema(schema);
  }

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });
}
