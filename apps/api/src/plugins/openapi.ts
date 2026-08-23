import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import { OPEN_API_SCHEMAS } from "../openapi/schemas.js";

const OPENAPI_METHODS = ["get", "post", "put", "patch", "delete"] as const;

type MutableOpenApiResponse = {
  $ref?: string;
  headers?: Record<string, unknown>;
};

type MutableOpenApiOperation = {
  responses?: Record<string, MutableOpenApiResponse>;
};

type MutableOpenApiPathItem = {
  $ref?: string;
} & Partial<Record<(typeof OPENAPI_METHODS)[number], MutableOpenApiOperation>>;

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
        headers: {
          RequestId: {
            description: "Request correlation ID. A safe caller-supplied value is preserved; otherwise the API generates a UUID.",
            schema: {
              type: "string",
              minLength: 8,
              maxLength: 128,
              pattern: "^[A-Za-z0-9._:-]+$"
            }
          }
        },
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
    },
    transformObject: (documentObject) => {
      if (!("openapiObject" in documentObject)) return documentObject.swaggerObject;

      const { openapiObject } = documentObject;
      const paths = (openapiObject.paths ?? {}) as Record<string, MutableOpenApiPathItem>;
      for (const pathItem of Object.values(paths)) {
        if (!pathItem || "$ref" in pathItem) continue;

        for (const method of OPENAPI_METHODS) {
          const operation = pathItem[method];
          if (!operation) continue;

          for (const response of Object.values(operation.responses ?? {})) {
            if ("$ref" in response) continue;
            response.headers = {
              ...response.headers,
              "x-request-id": { $ref: "#/components/headers/RequestId" }
            };
          }
        }
      }

      return openapiObject;
    }
  });

  for (const schema of OPEN_API_SCHEMAS) {
    app.addSchema(schema);
  }

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });
}
