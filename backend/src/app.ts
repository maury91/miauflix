import "reflect-metadata";

import { cors } from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { logger } from "@logger";
import { Elysia, t } from "elysia";

import { Database } from "@database/database";
import { createAuditLogMiddleware } from "@middleware/audit-log.middleware";
import { createAuthMiddleware } from "@middleware/auth.middleware";
import { createRateLimitMiddleware } from "@middleware/rate-limit.middleware";
import { createAuthRoutes } from "@routes/auth.routes";
import { AuthService } from "@services/auth/auth.service";
import { ListService } from "@services/media/list.service";
import { ListSynchronizer } from "@services/media/list.syncronizer";
import { MediaService } from "@services/media/media.service";
import { Scheduler } from "@services/scheduler";
import { AuditLogService } from "@services/security/audit-log.service";
import { VpnDetectionService } from "@services/security/vpn.service";
import { TMDBApi } from "@services/tmdb/tmdb.api";

import { validateConfiguration } from "./configuration";
import { ENV } from "./constants";

const db = new Database();

type Methods<T> = {
  [K in keyof T]: T[K] extends (...args: unknown[]) => void ? T[K] : never;
};

const bind =
  <T extends object, K extends keyof Methods<T>>(
    instance: T,
    method: K,
    ...args: Parameters<Methods<T>[K]>
  ) =>
  () => {
    return (instance[method] as Methods<T>[K])(...args);
  };

async function startApp() {
  await db.initialize();

  const tmdbApi = new TMDBApi();
  const vpnDetectionService = new VpnDetectionService();
  const auditLogService = new AuditLogService(db);
  const authService = new AuthService(db, auditLogService);
  const mediaService = new MediaService(db);
  const scheduler = new Scheduler();
  const listService = new ListService(db, tmdbApi, mediaService);
  const listSynchronizer = new ListSynchronizer(listService);

  // ToDo: just testing for now, later it will be part of another service
  vpnDetectionService.on("connect", () => {
    logger.debug("App", "VPN connected");
  });
  vpnDetectionService.on("disconnect", () => {
    logger.debug("App", "VPN disconnected");
  });

  await authService.configureUsers();

  scheduler.scheduleTask(
    "refreshLists",
    60 * 60, // 1 hour
    bind(listSynchronizer, "synchronize"),
  );

  // Schedule movie synchronization every 6 hours
  scheduler.scheduleTask(
    "syncMovies",
    1.5 * 60 * 60, // 1.5 hour
    bind(mediaService, "syncMovies"),
  );

  new Elysia()
    .use(serverTiming())
    .use(
      cors({
        origin: ENV("CORS_ORIGIN"),
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        exposeHeaders: ["Content-Range", "X-Content-Range"],
        credentials: true,
        maxAge: 86400, // 24 hours
      }),
    )
    .use(createAuthMiddleware(authService))
    .use(createAuditLogMiddleware(auditLogService))
    .use(createRateLimitMiddleware(auditLogService))
    .get(
      "/health",
      () => ({
        message: "Welcome to the Elysia and TypeScript project!",
      }),
      {
        rateLimit: 10, // 10 requests per second
      },
    )
    .get(
      "/lists",
      async () => {
        const lists = await listService.getLists();
        return lists.map((list) => ({
          name: list.name,
          slug: list.slug,
          description: list.description,
          url: `/list/${list.slug}`,
        }));
      },
      {
        isAuth: true,
        rateLimit: 5, // 2 requests per second
      },
    )
    .get(
      "/list/:slug",
      async ({ params, query }) => {
        const list = await listService.getListContent(params.slug, query.lang);
        return {
          results: list,
          total: list.length,
        };
      },
      {
        isAuth: true,
        params: t.Object({
          slug: t.String(),
        }),
        query: t.Object({
          lang: t.Optional(t.String()),
        }),
        rateLimit: 10, // 10 request per second
      },
    )
    .use(createAuthRoutes(authService, auditLogService))
    .listen(ENV.number("PORT"), (server) => {
      logger.info(
        "App",
        `Server is running on http://localhost:${server.port}`,
      );
    });
}

// Start the application: first check environment variables, then start the app
async function main() {
  try {
    await validateConfiguration();
    await startApp();
  } catch (error) {
    console.error("Error during application startup:", error);
    process.exit(1);
  }
}

main();
