import "reflect-metadata";
import { Elysia, t } from "elysia";
import { Database } from "./database/database";
import { TraktApi } from "@services/trakt/trakt.api";
import { TMDBApi } from "@services/tmdb/tmdb.api";
import { Scheduler } from "@services/scheduler";
import { MediaService } from "@services/media/media.service";
import { ListService } from "@services/media/list.service";
import { ListSynchronizer } from "@services/media/list.syncronizer";

const app = new Elysia();
const db = new Database();

const traktApi = new TraktApi();
const tmdbApi = new TMDBApi();

console.log("Hello!");

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

db.initialize()
  .then(async () => {
    const mediaService = new MediaService(db);
    const scheduler = new Scheduler();
    const listService = new ListService(db, tmdbApi, mediaService);
    const listSynchronizer = new ListSynchronizer(listService);

    scheduler.scheduleTask(
      "refreshLists",
      60 * 60,
      bind(listSynchronizer, "synchronize"),
    );

    app.get("/", () => ({
      message: "Welcome to the Elysia and TypeScript project!",
    }));

    app.get("/lists", async () => {
      const lists = await listService.getLists();
      return lists.map((list) => ({
        name: list.name,
        slug: list.slug,
        description: list.description,
        url: `/list/${list.slug}`,
      }));
    });

    app.get(
      "/list/:slug",
      async ({ params, query }) => {
        const list = await listService.getListContent(params.slug, query.lang);
        return {
          results: list,
          total: list.length,
        };
      },
      {
        params: t.Object({
          slug: t.String(),
        }),
        query: t.Object({
          lang: t.Optional(t.String()),
        }),
      },
    );

    app.listen(3000, () => {
      console.log(`Server is running on http://localhost:3000`);
    });
  })
  .catch((error) => console.log(error));
