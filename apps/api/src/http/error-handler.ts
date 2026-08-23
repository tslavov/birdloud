import type { FastifyError, FastifyInstance, FastifyRequest } from "fastify";
import { ApiError, sendApiError } from "./errors.js";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return sendApiError(reply, error);
    }

    const fastifyError = (
      typeof error === "object" && error !== null
        ? error
        : new Error("Unknown request failure.")
    ) as FastifyError;

    if (fastifyError.validation) {
      return reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Request validation failed.",
          details: {
            issues: fastifyError.validation.map((issue) => ({
              path: validationPath(fastifyError, request, issue),
              message: issue.message ?? "Invalid value."
            }))
          }
        }
      });
    }

    const clientStatus =
      typeof fastifyError.statusCode === "number" &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 500
        ? fastifyError.statusCode
        : null;

    if (clientStatus) {
      return reply.status(clientStatus).send({
        error: {
          code: clientStatus === 404 ? "NOT_FOUND" : "REQUEST_REJECTED",
          message: fastifyError.message,
          details: {}
        }
      });
    }

    request.log.error({ error: fastifyError }, "Unhandled API request failure");
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
        details: {}
      }
    });
  });
}

function validationPath(
  error: FastifyError,
  request: FastifyRequest,
  issue: NonNullable<FastifyError["validation"]>[number]
): string {
  const segments = issue.instancePath.split("/").filter(Boolean);
  const missingProperty =
    issue.keyword === "required" &&
    typeof issue.params === "object" &&
    issue.params !== null &&
    "missingProperty" in issue.params &&
    typeof issue.params.missingProperty === "string"
      ? issue.params.missingProperty
      : null;

  if (missingProperty) segments.push(missingProperty);

  return [error.validationContext ?? request.routeOptions.url, ...segments].join(".");
}
