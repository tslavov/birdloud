import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "./config/env.js";
import { registerErrorHandler } from "./http/error-handler.js";
import { ApiError } from "./http/errors.js";
import { betterAuthService, type AuthService } from "./lib/auth.js";
import { prisma } from "./lib/prisma.js";
import { getRedis } from "./lib/redis.js";
import { registerOpenApi } from "./plugins/openapi.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
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
};

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info"
    }
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true
  });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
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

  await registerOpenApi(app);
  await registerHealthRoutes(app);
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
        options.abuseSignalStore ?? createAbuseSignalStore(getRedis())
      ),
    authService
  );

  return app;
}
