import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { registerOpenApi } from "./plugins/openapi.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerOrganizerRoutes } from "./routes/organizer.js";
import { PrismaOrganizerService, type OrganizerService } from "./services/organizer.js";

export type BuildAppOptions = {
  organizerService?: OrganizerService;
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
    timeWindow: "1 minute"
  });

  await registerOpenApi(app);
  await registerHealthRoutes(app);
  await registerOrganizerRoutes(
    app,
    options.organizerService ?? new PrismaOrganizerService(prisma)
  );

  return app;
}
