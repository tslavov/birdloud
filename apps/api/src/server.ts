import { env } from "./config/env.js";
import { buildApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { closeRedis } from "./lib/redis.js";

const app = await buildApp();
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Graceful shutdown started");

  const forceClose = setTimeout(() => {
    app.log.error({ signal }, "Shutdown grace period elapsed; closing open connections");
    app.server.closeAllConnections();
  }, env.SHUTDOWN_GRACE_MS);
  forceClose.unref();

  try {
    await app.close();
    await Promise.allSettled([prisma.$disconnect(), closeRedis()]);
    app.log.info({ signal }, "Graceful shutdown completed");
  } catch (error) {
    app.log.error({ err: error, signal }, "Graceful shutdown failed");
    process.exitCode = 1;
  } finally {
    clearTimeout(forceClose);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

try {
  await app.listen({
    host: env.HOST,
    port: env.PORT
  });
} catch (error) {
  app.log.error({ err: error }, "API startup failed");
  await Promise.allSettled([app.close(), prisma.$disconnect(), closeRedis()]);
  process.exitCode = 1;
}
