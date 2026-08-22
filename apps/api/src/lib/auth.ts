import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";
import type { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";

export function createAuth(prismaClient: PrismaClient) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.CORS_ORIGIN],
    database: prismaAdapter(prismaClient, {
      provider: "postgresql"
    }),
    user: {
      additionalFields: {
        role: {
          type: ["ORGANIZER", "ADMIN"],
          required: true,
          defaultValue: "ORGANIZER",
          input: false
        }
      }
    },
    emailAndPassword: {
      enabled: true
    },
    advanced: {
      database: {
        generateId: "uuid"
      }
    }
  });
}

export type BirdLoudAuth = ReturnType<typeof createAuth>;

export const auth = createAuth(prisma);

export type AuthSession = {
  user: {
    id: string;
    role: string;
  };
};

export type AuthService = {
  handle(request: Request): Promise<Response>;
  getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null>;
};

export function createBetterAuthService(authInstance: BirdLoudAuth): AuthService {
  return {
    handle(request) {
      return authInstance.handler(request);
    },
    async getSession(headers) {
      const session = await authInstance.api.getSession({
        headers: fromNodeHeaders(headers)
      });

      if (!session) {
        return null;
      }

      return {
        user: {
          id: session.user.id,
          role: session.user.role
        }
      };
    }
  };
}

export const betterAuthService = createBetterAuthService(auth);
