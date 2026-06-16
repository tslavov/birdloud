import type { FastifyReply } from "fastify";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export function notFound(message: string): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function forbidden(message: string): ApiError {
  return new ApiError(403, "FORBIDDEN", message);
}

export function unauthorized(message: string): ApiError {
  return new ApiError(401, "AUTH_REQUIRED", message);
}

export function conflict(
  code: string,
  message: string,
  details: Record<string, unknown> = {}
): ApiError {
  return new ApiError(409, code, message, details);
}

export function badRequest(message: string, details: Record<string, unknown> = {}): ApiError {
  return new ApiError(400, "BAD_REQUEST", message, details);
}

export function sendApiError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof ApiError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
  }

  throw error;
}
