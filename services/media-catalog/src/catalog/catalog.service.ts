import { ListRepository } from '../db/list.repo';
import { LocalizationRepository } from '../db/localization.repo';
import { MovieRepository } from '../db/movie.repo';
import { SyncStateRepository } from '../db/sync-state.repo';
import { TVShowRepository } from '../db/tv-show.repo';
import { HttpError } from '../errors';
import type { CatalogProvider } from '../provider/provider';
import type {
  BatchResponse,
  ListDefinition,
  ListPage,
  MediaRef,
  MovieDetail,
  SeasonDetail,
  TVShowDetail,
} from '../types';
import { CatalogHydrator } from './catalog.hydrator';
import { CatalogLocalizer } from './catalog.localizer';
import { CatalogSynchronizer } from './catalog.syncer';

const oneHourMs = 36e5;

export interface CatalogValues {
  /** Refresh details older than this (ms). */
  hydrationTtlMs: number;
  /** 'GREEDY' syncs every show's episodes, 'ON_DEMAND' only watching ones. */
  episodeSyncMode: 'GREEDY' | 'ON_DEMAND';
}

/**
 * The catalog data plane: storage + freshness + localization over a provider.
 *
 * Every read is *ensured fresh* (repo-first, provider refresh when missing or stale)
 * so the main app's request path can treat this service exactly like the backend
 * used to treat its embedded TMDB service — one call, always-current data.
 */
export class CatalogService {
  private readonly hydrator: CatalogHydrator;
  private readonly localizer: CatalogLocalizer;
  private readonly synchronizer: CatalogSynchronizer;

  constructor(
    private readonly movies: MovieRepository,
    private readonly tvShows: TVShowRepository,
    private readonly localization: LocalizationRepository,
    private readonly lists: ListRepository,
    private readonly syncState: SyncStateRepository,
    private readonly provider: CatalogProvider,
    private readonly values: CatalogValues
  ) {
    this.hydrator = new CatalogHydrator(
      this.movies,
      this.tvShows,
      this.provider,
      this.values.hydrationTtlMs
    );
    this.localizer = new CatalogLocalizer(this.localization, this.tvShows, this.provider);
    this.synchronizer = new CatalogSynchronizer(
      this.movies,
      this.tvShows,
      this.syncState,
      this.provider,
      this.values.episodeSyncMode
    );
  }

  /* -------------------------------------------------------------------- movies */

  async getMovie(mediaId: number, language: string): Promise<MovieDetail> {
    await this.hydrator.ensureMovieFresh(mediaId);
    const row = this.movies.getMovie(mediaId);
    if (!row) throw new HttpError(404, `Movie ${mediaId} not found`);
    return await this.localizer.localizeMovie(row, language);
  }

  /* ------------------------------------------------------------------ tv shows */

  async getTVShow(mediaId: number, language: string): Promise<TVShowDetail> {
    await this.hydrator.ensureTVShowFresh(mediaId);
    const row = this.tvShows.getTVShow(mediaId);
    if (!row) throw new HttpError(404, `TV show ${mediaId} not found`);
    return await this.localizer.localizeTVShow(row, language);
  }

  /* ------------------------------------------------------------------- seasons */

  async getSeason(
    tvMediaId: number,
    seasonNumber: number,
    language: string
  ): Promise<SeasonDetail> {
    await this.hydrator.ensureTVShowFresh(tvMediaId);
    const entry = await this.hydrator.ensureSeasonFresh(tvMediaId, seasonNumber);
    return this.localizer.localizeSeason(entry.season, entry.episodes, language);
  }

  /* --------------------------------------------------------------------- batch */

  async batch(items: MediaRef[], language: string): Promise<BatchResponse> {
    const resolved = await Promise.all(
      items.map(async ref => {
        try {
          const detail =
            ref.mediaType === 'movie'
              ? await this.getMovie(ref.mediaId, language)
              : await this.getTVShow(ref.mediaId, language);
          return { detail };
        } catch {
          return { ref };
        }
      })
    );
    return {
      items: resolved.flatMap(entry => (entry.detail ? [entry.detail] : [])),
      missing: resolved.flatMap(entry => (entry.ref ? [entry.ref] : [])),
    };
  }

  /* --------------------------------------------------------------------- lists */

  async listDefinitions(): Promise<ListDefinition[]> {
    return this.lists.listDefinitions();
  }

  async getListPage(slug: string, page: number, language: string): Promise<ListPage> {
    const cached = this.lists.getCachedListPage(slug, page, language, oneHourMs);
    if (cached) {
      return {
        slug,
        page,
        totalPages: cached.totalPages,
        totalItems: cached.totalItems,
        items: cached.items as ListPage['items'],
      };
    }
    const fetched = await this.provider.getListPage(slug, page, language);
    this.lists.putCachedListPage(
      slug,
      page,
      language,
      { items: fetched.items, totalPages: fetched.totalPages, totalItems: fetched.totalItems },
      oneHourMs
    );
    return {
      slug,
      page: fetched.page,
      totalPages: fetched.totalPages,
      totalItems: fetched.totalItems,
      items: fetched.items,
    };
  }

  /* -------------------------------------------------------------------- genres */

  async getGenres(language: string): Promise<Array<{ id: number; name: string }>> {
    const cached = this.localization.getCachedGenres(language);
    if (cached) return cached;
    const genres = await this.provider.getGenres(language);
    this.localization.upsertGenres(genres, language);
    return genres;
  }

  /* -------------------------------------------------------------- change syncs */

  async syncMovies(): Promise<void> {
    await this.synchronizer.syncMovies();
  }

  async syncTVShows(): Promise<void> {
    await this.synchronizer.syncTVShows();
  }

  async syncIncompleteSeasons(): Promise<void> {
    await this.synchronizer.syncIncompleteSeasons();
  }
}
