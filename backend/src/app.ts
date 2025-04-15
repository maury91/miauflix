import "reflect-metadata";
import { Elysia, t } from "elysia";
import { serverTiming } from "@elysiajs/server-timing";
import { cors } from "@elysiajs/cors";

import { Database } from "./database/database";
import { TraktApi } from "@services/trakt/trakt.api";
import { TMDBApi } from "@services/tmdb/tmdb.api";
import { Scheduler } from "@services/scheduler";
import { MediaService } from "@services/media/media.service";
import { ListService } from "@services/media/list.service";
import { ListSynchronizer } from "@services/media/list.syncronizer";
import { validateConfiguration } from "./configuration";
import { ENV } from "./constants";
import { AuthService } from "@services/auth/auth.service";
import { createAuthRoutes } from "@routes/auth.routes";
import { createAuthMiddleware } from "@middleware/auth.middleware";
import { AuditLogService } from "@services/security/audit-log.service";
import { createAuditLogMiddleware } from "@middleware/audit-log.middleware";
import { createRateLimitMiddleware } from "./middleware/rate-limit.middleware";
import { VpnDetectionService } from "@services/security/vpn.service";

const db = new Database();

type Methods<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : never;
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

  const traktApi = new TraktApi();
  const tmdbApi = new TMDBApi();
  const vpnDetectionService = new VpnDetectionService();
  const auditLogService = new AuditLogService(db);
  const authService = new AuthService(db, auditLogService);
  const mediaService = new MediaService(db);
  const scheduler = new Scheduler();
  const listService = new ListService(db, tmdbApi, mediaService);
  const listSynchronizer = new ListSynchronizer(listService);

  // ToDo: just testing for now, later it will be part of another service
  console.log("vpn detected :", await vpnDetectionService.isVpnActive());

  await authService.configureUsers();

  scheduler.scheduleTask(
    "refreshLists",
    60 * 60,
    bind(listSynchronizer, "synchronize"),
  );

  new Elysia()
    .use(serverTiming())
    .use(
      cors({
        origin: ENV("CORS_ORIGIN", "*"),
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
    .listen(3000, () => {
      console.log(`Server is running on http://localhost:3000`);
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
