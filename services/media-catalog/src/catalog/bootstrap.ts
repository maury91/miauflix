import type { ConfigurationProbe } from '@miauflix/service-configuration';

import { AnimeIndex } from '../anime/anime-index';
import type { CatalogConfigService } from '../config/config.service';
import { AnimeLayoutRepository } from '../db/anime-layout.repo';
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
import type { ArtworkListeners } from '../services/artwork-selection.service';
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
 *
 * At most one CatalogService is active at a time: activation retires the previous one (its
 * artwork pump, worker thread, timers and queued backdrop analyses) as it installs the next, and
 * activation, deactivation and stop run one after another. `ctx.catalog` is never null during a
 * replacement, and deactivation drains the queue workers before detaching it: a job that found
 * no catalog would be acknowledged without running. The backend pushes its configuration every time it
 * connects, so without this each reconnect left another instance running. Testing a configuration
 * only builds a provider, never a CatalogService.
 */
export class CatalogRuntime {
  private readonly movies: MovieRepository;
  private readonly tvShows: TVShowRepository;
  private readonly localization: LocalizationRepository;
  private readonly syncState: SyncStateRepository;
  private readonly apiCache: ApiCache;
  private readonly backdropFocus: BackdropFocusRepository;
  private readonly artwork: ArtworkRepository;
  private readonly animeIndex: AnimeIndex;
  private readonly animeLayouts: AnimeLayoutRepository;
  private workerManager: CatalogWorkerManager;
  private stopped = false;
  /** The only active instance; `ctx.catalog` mirrors it for the request handlers. */
  private active: CatalogService | null = null;
  /**
   * Artwork subscribers, shared by every instance: the host subscribes once while the service is
   * ready, and a configuration push that replaces the instance keeps it ready, so subscriptions
   * must survive the replacement.
   */
  private readonly artworkListeners: ArtworkListeners = new Set();
  /** Lifecycle operations, chained so they never overlap. */
  private lifecycle: Promise<unknown> = Promise.resolve();

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
    this.animeLayouts = new AnimeLayoutRepository(ctx.db);
    this.animeIndex = new AnimeIndex(
      ctx.env.dataDir,
      this.apiCache,
      fetch,
      Date.now,
      ctx.env.anime
    );
    this.workerManager = new CatalogWorkerManager(ctx.env, () => ctx.catalog);
    config.registerProber(this.prober);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.exclusive(async () => {
      await this.workerManager.stop();
      await this.retire();
    });
  }

  private deactivate(): Promise<void> {
    return this.exclusive(async () => {
      // Running jobs finish with the catalog still attached
      await this.workerManager.pause();
      await this.retire();
    });
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycle.then(operation);
    this.lifecycle = result.catch(() => undefined);
    return result;
  }

  /** Detaches the active instance and stops its background work. */
  private async retire(): Promise<void> {
    const previous = this.active;
    this.active = null;
    this.ctx.catalog = null;
    await previous?.stopArtworkBackground();
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

    activate: values => this.exclusive(() => this.activate(values)),

    deactivate: async () => {
      await this.deactivate();
      return { success: true, message: 'Catalog runtime returned to standby' };
    },
  };

  private async activate(
    values: Record<string, string>
  ): Promise<{ success: boolean; message: string }> {
    if (this.stopped) return { success: false, message: 'Catalog runtime is stopping' };
    const provider = this.buildProvider(values);
    try {
      await provider.test();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The active instance, if any, keeps serving with its configuration
      return { success: false, message };
    }

    if (this.stopped) return { success: false, message: 'Catalog runtime is stopping' };

    const previous = this.active;
    const catalog = new CatalogService(
      this.movies,
      this.tvShows,
      this.localization,
      this.syncState,
      provider,
      this.catalogValues(values),
      this.backdropFocus,
      this.artwork,
      { index: this.animeIndex, layouts: this.animeLayouts },
      this.artworkListeners
    );
    // Retiring flags the previous instance synchronously, so it stops queuing work before this one
    // starts; only its worker-thread shutdown is awaited. Jobs already running keep the instance
    // they started with, whose catalog methods still work.
    const retiring = previous?.stopArtworkBackground();
    this.active = catalog;
    this.ctx.catalog = catalog;
    if (!this.ctx.env.disableBackgroundTasks) catalog.startBackdropFocusBackground();
    void catalog
      .getGenres('en')
      .catch(error => logger.warn('CatalogRuntime', 'Unable to preload English genres', error));
    this.workerManager.start();
    // The replacement is installed and serving: the old instance failing to shut down does not
    // make this activation fail (reporting it would have the configuration activate yet another
    // instance with the previous values)
    await retiring?.catch(error =>
      logger.warn('CatalogRuntime', 'The replaced catalog did not shut down cleanly', error)
    );
    return { success: true, message: `Catalog provider '${provider.name}' is ready` };
  }
}
