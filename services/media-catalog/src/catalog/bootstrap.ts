import type { ConfigurationProbe } from '@miauflix/service-configuration';

import type { CatalogConfigService } from '../config/config.service';
import { ArtworkRepository } from '../db/artwork.repo';
import { BackdropFocusRepository } from '../db/backdrop-focus.repo';
import { LocalizationRepository } from '../db/localization.repo';
import { MovieRepository } from '../db/movie.repo';
import { SyncStateRepository } from '../db/sync-state.repo';
import { TVShowRepository } from '../db/tv-show.repo';
import { logger } from '../logger';
import type { CatalogProvider } from '../provider/provider';
import { TmdbProvider } from '../provider/tmdb/tmdb.provider';
import type { ServiceContext } from '../service-context';
import { DEFAULT_BACKDROP_FOCUS_CONCURRENCY } from '../services/backdrop-focus.service';
import { ApiCache } from '../utils/api-cache';
import { CatalogWorkerManager } from '../workers/worker';
import type { CatalogValues } from './catalog.service';
import { CatalogService } from './catalog.service';

/**
 * Wires the catalog data plane to the service lifecycle:
 * - registers the configuration prober (the live provider probe behind
 *   `POST /configuration/test` and the main app's config push)
 * - activates the provider + data plane only after a backend configuration push succeeds
 * - installs the queue workers once activation attaches the data plane
 */
export class CatalogRuntime {
  private readonly movies: MovieRepository;
  private readonly tvShows: TVShowRepository;
  private readonly localization: LocalizationRepository;
  private readonly syncState: SyncStateRepository;
  private readonly apiCache: ApiCache;
  private readonly backdropFocus: BackdropFocusRepository;
  private readonly artwork: ArtworkRepository;
  private workerManager: CatalogWorkerManager;
  private stopped = false;

  constructor(
    private readonly ctx: ServiceContext,
    private readonly config: CatalogConfigService
  ) {
    this.movies = new MovieRepository(ctx.db);
    this.tvShows = new TVShowRepository(ctx.db);
    this.localization = new LocalizationRepository(ctx.db);
    this.syncState = new SyncStateRepository(ctx.db);
    this.apiCache = new ApiCache(ctx.db);
    this.backdropFocus = new BackdropFocusRepository(ctx.db);
    this.artwork = new ArtworkRepository(ctx.db);
    this.workerManager = new CatalogWorkerManager(ctx.env, () => ctx.catalog);
    config.registerProber(this.prober);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.ctx.catalog?.stopArtworkBackground();
    await this.workerManager.stop();
    this.ctx.catalog = null;
  }

  private async deactivate(): Promise<void> {
    await this.ctx.catalog?.stopArtworkBackground();
    this.ctx.catalog = null;
    await this.workerManager.pause();
  }

  private buildProvider(values: Record<string, string>): CatalogProvider {
    return TmdbProvider.build(this.apiCache, {
      apiUrl: values.TMDB_API_URL,
      accessToken: values.TMDB_API_ACCESS_TOKEN,
    });
  }

  private catalogValues(values: Record<string, string>): CatalogValues {
    const backdropFocusBackgroundIntervalMs = Number(values.BACKDROP_FOCUS_BACKGROUND_INTERVAL_MS);
    const backdropFocusConcurrency = Number(values.BACKDROP_FOCUS_CONCURRENCY);
    return {
      hydrationTtlMs: Number(values.CATALOG_HYDRATION_TTL_MS) || 24 * 60 * 60 * 1000,
      episodeSyncMode: values.EPISODE_SYNC_MODE === 'GREEDY' ? 'GREEDY' : 'ON_DEMAND',
      backdropFocusConcurrency: Number.isFinite(backdropFocusConcurrency)
        ? Math.min(8, Math.max(1, Math.floor(backdropFocusConcurrency)))
        : DEFAULT_BACKDROP_FOCUS_CONCURRENCY,
      backdropFocusBackgroundIntervalMs: Number.isFinite(backdropFocusBackgroundIntervalMs)
        ? Math.max(1000, Math.floor(backdropFocusBackgroundIntervalMs))
        : 20_000,
    };
  }

  private prober: ConfigurationProbe = {
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

      const catalog = new CatalogService(
        this.movies,
        this.tvShows,
        this.localization,
        this.syncState,
        provider,
        this.catalogValues(values),
        this.backdropFocus,
        this.artwork
      );
      this.ctx.catalog = catalog;
      if (!this.ctx.env.disableBackgroundTasks) catalog.startBackdropFocusBackground();
      void catalog
        .getGenres('en')
        .catch(error => logger.warn('CatalogRuntime', 'Unable to preload English genres', error));
      this.workerManager.start();
      return { success: true, message: `Catalog provider '${provider.name}' is ready` };
    },

    deactivate: async () => {
      await this.deactivate();
      return { success: true, message: 'Catalog runtime returned to standby' };
    },
  };
}
