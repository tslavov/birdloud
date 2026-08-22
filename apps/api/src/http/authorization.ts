import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "../lib/auth.js";
import { ApiError, unauthorized } from "./errors.js";

export type AuthorizedOrganizer = {
  id: string;
  role: "organizer" | "admin";
};

export async function requireOrganizer(
  request: FastifyRequest,
  authService: AuthService
): Promise<AuthorizedOrganizer> {
  const session = await authService.getSession(request.headers);

  if (!session) {
    throw unauthorized("Organizer authentication is required.");
  }

  if (!z.string().uuid().safeParse(session.user.id).success) {
    throw new ApiError(401, "AUTH_SESSION_INVALID", "The organizer session is invalid.");
  }

  const role = normalizeRole(session.user.role);

  if (!role) {
    throw new ApiError(
      403,
      "ORGANIZER_ROLE_REQUIRED",
      "An organizer or administrator role is required."
    );
  }

  return {
    id: session.user.id,
    role
  };
}

function normalizeRole(role: string): AuthorizedOrganizer["role"] | null {
  if (role === "ORGANIZER" || role === "organizer") return "organizer";
  if (role === "ADMIN" || role === "admin") return "admin";
  return null;
}
