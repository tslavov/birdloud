import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.CORS_ORIGIN],
  database: prismaAdapter(prisma, {
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

export const betterAuthService: AuthService = {
  handle(request) {
    return auth.handler(request);
  },
  async getSession(headers) {
    const session = await auth.api.getSession({
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
