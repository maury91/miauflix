import type { CatalogConfigService, ConfigProber } from '../config/config.service';
import { ListRepository } from '../db/list.repo';
import { LocalizationRepository } from '../db/localization.repo';
import { MovieRepository } from '../db/movie.repo';
import { SyncStateRepository } from '../db/sync-state.repo';
import { TVShowRepository } from '../db/tv-show.repo';
import { logger } from '../logger';
import type { CatalogProvider } from '../provider/provider';
import { TmdbProvider } from '../provider/tmdb/tmdb.provider';
import type { ServiceContext } from '../service-context';
import { ApiCache } from '../utils/api-cache';
import { CatalogWorkerManager } from '../workers/worker';
import type { CatalogValues } from './catalog.service';
import { CatalogService } from './catalog.service';

const SCOPE = 'CatalogBootstrap';

/**
 * Wires the catalog data plane to the service lifecycle:
 * - registers the configuration prober (the live provider probe behind
 *   `POST /configuration/test` and the main app's config push)
 * - activates the provider + data plane only after an applied or reloaded
 *   configuration succeeds
 * - installs the queue workers once activation attaches the data plane
 */
export class CatalogRuntime {
  private readonly movies: MovieRepository;
  private readonly tvShows: TVShowRepository;
  private readonly localization: LocalizationRepository;
  private readonly lists: ListRepository;
  private readonly syncState: SyncStateRepository;
  private readonly apiCache: ApiCache;
  private workerManager: CatalogWorkerManager;
  private stopped = false;

  constructor(
    private readonly ctx: ServiceContext,
    private readonly config: CatalogConfigService
  ) {
    this.movies = new MovieRepository(ctx.db);
    this.tvShows = new TVShowRepository(ctx.db);
    this.localization = new LocalizationRepository(ctx.db);
    this.lists = new ListRepository(ctx.db);
    this.syncState = new SyncStateRepository(ctx.db);
    this.apiCache = new ApiCache(ctx.db);
    this.workerManager = new CatalogWorkerManager(
      ctx.env,
      () => ctx.catalog,
      key => config.resolve(key)
    );
    config.registerProber(this.prober);
  }

  /** Boot self-activation: become ready from env/file config without the main app. */
  async tryActivate(): Promise<void> {
    const result = await this.config.reload();
    if (result) {
      logger.info(SCOPE, 'Catalog activated from local configuration (standalone mode)');
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.workerManager.stop();
    this.ctx.catalog = null;
  }

  private buildProvider(values: Record<string, string>): CatalogProvider {
    return TmdbProvider.build(this.apiCache, {
      apiUrl: values.TMDB_API_URL,
      accessToken: values.TMDB_API_ACCESS_TOKEN,
    });
  }

  private catalogValues(values: Record<string, string>): CatalogValues {
    return {
      hydrationTtlMs: Number(values.CATALOG_HYDRATION_TTL_MS) || 24 * 60 * 60 * 1000,
      episodeSyncMode: values.EPISODE_SYNC_MODE === 'GREEDY' ? 'GREEDY' : 'ON_DEMAND',
    };
  }

  private prober: ConfigProber = {
    test: async values => {
      const provider = this.buildProvider(values);
      try {
        await provider.test();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, message };
      }
      return { success: true, message: `Catalog provider '${provider.name}' is ready` };
    },

    activate: async values => {
      if (this.stopped) return { success: false, message: 'Catalog runtime is stopping' };
      const provider = this.buildProvider(values);
      try {
        await provider.test();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, message };
      }

      if (this.stopped) return { success: false, message: 'Catalog runtime is stopping' };

      this.lists.upsertListDefinitions(provider.listDefinitions(), provider.name);
      this.ctx.catalog = new CatalogService(
        this.movies,
        this.tvShows,
        this.localization,
        this.lists,
        this.syncState,
        provider,
        this.catalogValues(values)
      );
      this.workerManager.start();
      return { success: true, message: `Catalog provider '${provider.name}' is ready` };
    },
  };
}
