import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { env } from "./config/env.js";
import { registerErrorHandler } from "./http/error-handler.js";
import { ApiError } from "./http/errors.js";
import { betterAuthService, type AuthService } from "./lib/auth.js";
import { prisma } from "./lib/prisma.js";
import { getRedis } from "./lib/redis.js";
import { registerOpenApi } from "./plugins/openapi.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes, type ReadinessChecks } from "./routes/health.js";
import { registerOrganizerRoutes } from "./routes/organizer.js";
import { registerVotingRoutes } from "./routes/voting.js";
import { PrismaOrganizerService, type OrganizerService } from "./services/organizer.js";
import { createAbuseSignalStore, type AbuseSignalStore } from "./services/abuse-signals.js";
import { createVoterEmailSender, type VoterEmailSender } from "./services/voter-email.js";
import { createTurnstileVerifier, type TurnstileVerifier } from "./services/turnstile.js";
import { PrismaVotingService, type VotingService } from "./services/voting.js";

export type BuildAppOptions = {
  authService?: AuthService;
  organizerService?: OrganizerService;
  votingService?: VotingService;
  voterEmailSender?: VoterEmailSender;
  turnstileVerifier?: TurnstileVerifier;
  abuseSignalStore?: AbuseSignalStore;
  redis?: Redis | false;
  readinessChecks?: ReadinessChecks;
};

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
          "body.email",
          "body.password",
          "body.token",
          "body.inviteToken",
          "body.botProtectionToken",
          "body.identity.proof",
          "req.body.email",
          "req.body.password",
          "req.body.token",
          "req.body.inviteToken",
          "req.body.botProtectionToken",
          "req.body.identity.proof"
        ],
        censor: "[REDACTED]"
      },
      serializers: {
        req(request) {
          return serializeRequestForLog(request);
        }
      }
    },
    trustProxy: env.TRUST_PROXY,
    genReqId(rawRequest) {
      const incoming = rawRequest.headers["x-request-id"];
      return validRequestId(incoming) ?? randomUUID();
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true
  });
  const runtimeRedis =
    options.redis === false
      ? undefined
      : options.redis ?? (env.NODE_ENV === "test" ? undefined : getRedis());
  const redisErrorHandler = runtimeRedis
    ? (error: Error) => app.log.warn({ err: error }, "Redis operation failed")
    : undefined;
  if (runtimeRedis && redisErrorHandler) {
    runtimeRedis.on("error", redisErrorHandler);
    app.addHook("onClose", async () => {
      runtimeRedis.off("error", redisErrorHandler);
    });
  }

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    nameSpace: `${env.REDIS_KEY_PREFIX}:rate-limit:`,
    skipOnError: true,
    ...(runtimeRedis ? { redis: runtimeRedis } : {}),
    errorResponseBuilder(_request, context) {
      return new ApiError(
        context.statusCode,
        "RATE_LIMIT_EXCEEDED",
        `Rate limit exceeded. Retry in ${context.after}.`,
        {
          retryAfter: context.after
        }
      );
    }
  });
  registerErrorHandler(app);

  const authService = options.authService ?? betterAuthService;
  const readinessChecks =
    options.readinessChecks ??
    ({
      database: () => prisma.$queryRawUnsafe("SELECT 1"),
      redis: () => (runtimeRedis ?? getRedis()).ping()
    } satisfies ReadinessChecks);

  await registerOpenApi(app);
  await registerHealthRoutes(app, readinessChecks, env.READINESS_TIMEOUT_MS);
  await registerAuthRoutes(app, authService);
  await registerOrganizerRoutes(
    app,
    options.organizerService ?? new PrismaOrganizerService(prisma),
    authService
  );
  await registerVotingRoutes(
    app,
    options.votingService ??
      new PrismaVotingService(
        prisma,
        options.voterEmailSender ?? createVoterEmailSender(),
        options.turnstileVerifier ?? createTurnstileVerifier(),
        options.abuseSignalStore ?? createAbuseSignalStore(runtimeRedis ?? getRedis())
      ),
    authService
  );

  return app;
}

function validRequestId(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value) ? value : undefined;
}

export function serializeRequestForLog(request: {
  method?: string | undefined;
  url?: string | undefined;
  routeOptions?: { url?: string | undefined } | undefined;
}) {
  return {
    method: request.method ?? "UNKNOWN",
    route: request.routeOptions?.url ?? request.url?.split("?")[0] ?? "unknown"
  };
}
