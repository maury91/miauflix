import { logger } from '@logger';

import type { Database } from '@database/database';
import type { MediaList } from '@entities/list.entity';
import type { MediaListItemType } from '@entities/list.entity';
import { MediaError } from '@errors/media.errors';
import type { MediaListRepository } from '@repositories/mediaList.repository';
import type { BackgroundJobService } from '@services/background-job/background-job.service';
import type {
  ListDefinition,
  MediaRef,
  MediaSummary,
  MovieDetail,
  TVShowDetail,
} from '@services/catalog/catalog.types';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';
import { traced } from '@utils/tracing.util';

/**
 * List membership and ordering live locally (generation-staged snapshots so a
 * refresh never shows a half-updated list); the list *content* comes from the
 * media-catalog service. Staging a page ensures fresh details via one batch call
 * (so the local index has imdbIds before source discovery runs), mirrors them
 * locally, and enqueues source discovery for the movies.
 */
export class ListService {
  private readonly mediaListRepository: MediaListRepository;
  private readonly movieRepository;
  private readonly tvShowRepository;

  constructor(
    private readonly db: Database,
    private readonly catalogClient: CatalogClientService,
    private readonly backgroundJobs?: BackgroundJobService
  ) {
    this.mediaListRepository = db.getMediaListRepository();
    this.movieRepository = db.getMovieRepository();
    this.tvShowRepository = db.getTVShowRepository();
  }

  public async getLists(): Promise<ListDefinition[]> {
    return this.catalogClient.getListDefinitions();
  }

  /**
   * Refreshes a list while retaining only database ids. Existing media is updated with
   * scalar queries; a missing item is resolved one at a time so detail graphs can be
   * released before the next item is fetched.
   */
  @traced('ListService')
  async refreshList(slug: string, maxPages: number): Promise<void> {
    const mediaList = await this.getOrCreateList(slug, false);
    const generation = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const firstPage = await this.catalogClient.getListPage(slug, 1);
      const seen = new Set<string>();
      const resolveUniquePage = (items: MediaSummary[], priority: number) =>
        this.resolvePage(
          items.filter(item => {
            const key = `${item.mediaType}:${item.mediaId}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }),
          priority
        );
      const firstItems = await resolveUniquePage(firstPage.items, 80);

      if (!mediaList.activeGeneration) {
        const bootstrapGeneration = `${generation}-bootstrap`;
        await this.mediaListRepository.stagePage(mediaList.id, bootstrapGeneration, 0, firstItems);
        await this.mediaListRepository.activateGeneration(mediaList.id, bootstrapGeneration);
        mediaList.activeGeneration = bootstrapGeneration;
      }

      await this.mediaListRepository.stagePage(mediaList.id, generation, 0, firstItems);
      const pageLimit = Math.min(firstPage.totalPages, maxPages);
      let offset = firstItems.length;
      for (let page = 2; page <= pageLimit; page++) {
        const result = await this.catalogClient.getListPage(slug, page);
        logger.debug(
          'ListService',
          `List ${slug} has ${result.totalItems} results and ${result.totalPages} pages, obtained page ${page}`
        );
        const items = await resolveUniquePage(result.items, 50);
        await this.mediaListRepository.stagePage(mediaList.id, generation, offset, items);
        offset += items.length;
      }
      await this.mediaListRepository.activateGeneration(mediaList.id, generation);
    } catch (error) {
      await this.mediaListRepository.discardGeneration(mediaList.id, generation);
      throw error;
    }
  }

  async createRefreshPlan(
    slug: string,
    maxPages: number
  ): Promise<{
    generation: string;
    listId: number;
    pageCount: number;
    pageSize: number;
  }> {
    const [list, firstPage] = await Promise.all([
      this.getOrCreateList(slug, false),
      this.catalogClient.getListPage(slug, 1),
    ]);
    return {
      generation: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      listId: list.id,
      pageCount: Math.min(firstPage.totalPages, maxPages),
      pageSize: Math.max(1, firstPage.items.length),
    };
  }

  async stageRefreshPage(
    slug: string,
    listId: number,
    generation: string,
    page: number,
    pageSize: number
  ): Promise<void> {
    const result = await this.catalogClient.getListPage(slug, page);
    const items = await this.resolvePage(result.items, page === 1 ? 80 : 50);
    await this.mediaListRepository.stagePage(listId, generation, (page - 1) * pageSize, items);
  }

  activateRefreshGeneration(listId: number, generation: string): Promise<void> {
    return this.mediaListRepository.activateGeneration(listId, generation);
  }

  /**
   * Mirrors a provider page into the local index: one batch call ensures fresh
   * details (imdbIds included), then membership rows are staged and source
   * discovery is enqueued for the movies. Items the catalog cannot resolve are
   * mirrored from the summary alone so list ordering stays stable.
   */
  private async resolvePage(
    medias: MediaSummary[],
    priority: number
  ): Promise<Array<{ mediaType: MediaListItemType; mediaId: number }>> {
    const resolved: Array<{ mediaType: MediaListItemType; mediaId: number }> = [];
    const refs: MediaRef[] = medias.map(media => ({
      mediaType: media.mediaType,
      mediaId: media.mediaId,
    }));

    const details = new Map<string, MovieDetail | TVShowDetail>();
    try {
      const batch = await this.catalogClient.batch(refs, 'en');
      for (const detail of batch.items) {
        details.set(`${detail.mediaType}:${detail.mediaId}`, detail);
      }
      for (const missing of batch.missing) {
        logger.warn(
          'ListService',
          `Catalog could not resolve ${missing.mediaType} ${missing.mediaId} while refreshing a list`
        );
      }
    } catch (error) {
      logger.warn('ListService', 'Batch detail fetch failed; falling back to summaries', error);
    }

    for (const media of medias) {
      try {
        const detail = details.get(`${media.mediaType}:${media.mediaId}`);
        if (media.mediaType === 'movie') {
          if (detail && detail.mediaType === 'movie') {
            await this.movieRepository.upsertMovieDetail(detail);
          } else {
            await this.mirrorMovieSummary(media);
          }
          resolved.push({ mediaType: 'movie', mediaId: media.mediaId });
          this.backgroundJobs?.enqueueBestEffort({
            type: 'source.discover',
            dedupeKey: `media:${media.mediaId}`,
            payload: { movieMediaId: media.mediaId },
            options: { priority: Math.max(1, priority - 20) },
          });
        } else {
          if (detail && detail.mediaType === 'tv') {
            await this.tvShowRepository.upsertTVShowDetail(detail);
          } else {
            await this.mirrorTVShowSummary(media);
          }
          resolved.push({ mediaType: 'tv', mediaId: media.mediaId });
        }
      } catch (error) {
        logger.warn(
          'ListService',
          `Skipping ${media.mediaType} ${media.mediaId} while refreshing list`,
          error
        );
      }
    }
    return resolved;
  }

  /** Summary-only fallback so list staging survives a detail fetch failure. */
  private async mirrorMovieSummary(media: MediaSummary): Promise<void> {
    const existing = await this.movieRepository.findByMediaId(media.mediaId);
    if (existing) {
      await this.movieRepository.updateFromSummary(media.mediaId, {
        title: media.title,
        overview: media.overview,
        popularity: media.popularity,
        releaseDate: media.releaseDate,
        poster: media.poster,
        backdrop: media.backdrop,
      });
    } else {
      await this.movieRepository.createFromSummary({
        mediaId: media.mediaId,
        title: media.title,
        overview: media.overview,
        popularity: media.popularity,
        releaseDate: media.releaseDate,
        poster: media.poster,
        backdrop: media.backdrop,
      });
    }
  }

  private async mirrorTVShowSummary(media: MediaSummary): Promise<void> {
    const existing = await this.tvShowRepository.findByMediaId(media.mediaId);
    if (existing) {
      await this.tvShowRepository.updateFromSummary(media.mediaId, {
        name: media.title,
        overview: media.overview,
        popularity: media.popularity,
        firstAirDate: media.releaseDate,
        poster: media.poster,
        backdrop: media.backdrop,
      });
    } else {
      await this.tvShowRepository.createFromSummary({
        mediaId: media.mediaId,
        name: media.title,
        overview: media.overview,
        popularity: media.popularity,
        firstAirDate: media.releaseDate,
        poster: media.poster,
        backdrop: media.backdrop,
      });
    }
  }

  private async getOrCreateList(slug: string, preload: boolean): Promise<MediaList> {
    let mediaList = await this.mediaListRepository.findBySlug(slug, preload);
    if (!mediaList) {
      const lists = await this.catalogClient.getListDefinitions();
      const list = lists.find(candidate => candidate.slug === slug);
      if (list) {
        mediaList = await this.mediaListRepository.createMediaList(
          list.name,
          list.description,
          slug
        );
      } else {
        throw new MediaError(`List with slug ${slug} not found`, 'list_not_found');
      }
    }
    return mediaList;
  }

  @traced('ListService')
  async getListBySlug(slug: string): Promise<MediaList> {
    const mediaList = await this.getOrCreateList(slug, false);
    if (!mediaList.activeGeneration) {
      await this.refreshList(slug, 1);
      return await this.getOrCreateList(slug, false);
    }
    return mediaList;
  }

  /**
   * Renders a stored list page: membership rows give identity and order; the
   * catalog batch call supplies the localized display data.
   */
  @traced('ListService')
  async getListPage(
    slug: string,
    language = 'en',
    page = 0,
    limit = 20
  ): Promise<{
    medias: Array<{ localId: number } & (MovieDetail | TVShowDetail)>;
    total: number;
  }> {
    const list = await this.getListBySlug(slug);
    if (!list.activeGeneration) return { medias: [], total: 0 };
    const [items, total] = await Promise.all([
      this.mediaListRepository.getPage(list.id, list.activeGeneration, page * limit, limit),
      this.mediaListRepository.countItems(list.id, list.activeGeneration),
    ]);
    const refs: MediaRef[] = items.map(item => ({
      mediaType: item.mediaType,
      mediaId: item.mediaId,
    }));
    const batch = await this.catalogClient.batch(refs, language);
    const detailByRef = new Map(
      batch.items.map(detail => [`${detail.mediaType}:${detail.mediaId}`, detail])
    );
    const localMovies = await this.movieRepository.findListItemsByMediaIds(
      items.filter(item => item.mediaType === 'movie').map(item => item.mediaId)
    );
    const localShows = await this.tvShowRepository.findListItemsByMediaIds(
      items.filter(item => item.mediaType === 'tv').map(item => item.mediaId)
    );
    const localByRef = new Map<string, number>();
    for (const movie of localMovies) localByRef.set(`movie:${movie.mediaId}`, movie.id);
    for (const show of localShows) localByRef.set(`tv:${show.mediaId}`, show.id);

    const ordered = items.flatMap(item => {
      const detail = detailByRef.get(`${item.mediaType}:${item.mediaId}`);
      const localId = localByRef.get(`${item.mediaType}:${item.mediaId}`);
      if (!detail || localId === undefined) return [];
      return [{ ...detail, localId }];
    });
    return { medias: ordered, total };
  }

  @traced('ListService')
  async getListContent(
    slug: string,
    language = 'en'
  ): Promise<Array<{ localId: number } & (MovieDetail | TVShowDetail)>> {
    return (await this.getListPage(slug, language, 0, 10_000)).medias;
  }
}
