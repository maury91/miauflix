import { logger } from '@logger';
import type {
  ListServiceDefinition,
  ListServiceDefinitionsPage,
} from '@miauflix/service-contracts';

import type { Database } from '@database/database';
import type { MediaList, MediaListItemType } from '@entities/list.entity';
import { MediaError } from '@errors/media.errors';
import type { MediaListRepository } from '@repositories/mediaList.repository';
import type { BackgroundJobService } from '@services/background-job/background-job.service';
import type {
  ExternalMediaLookup,
  MediaRef,
  MediaSummary,
  MovieDetail,
  TVShowDetail,
} from '@services/catalog/catalog.types';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';
import type { ListClientService } from '@services/list/list-client.service';
import { traced } from '@utils/tracing.util';

export const DEFAULT_LIST_REFRESH_PAGES = 6;
export const LOCAL_WATCHLIST_SLUG = 'my-watchlist';
const LIST_BASE_PRIORITY = 90;
const LIST_MIN_PRIORITY = 20;
const LIST_PREFETCH_PRIORITY_OFFSET = 20;
const VIEWPORT_PRIORITY = 100;

export type ListLoadPriority = 'prefetch' | 'visible';
export type MediaPriorityRequest = {
  mediaType: 'movie' | 'tv';
  mediaId: number;
  tier: 'viewport' | 'visible';
};

export function listDownstreamPriority(
  listRank: number,
  itemRank: number,
  loadPriority: ListLoadPriority = 'visible'
): number {
  const priority = LIST_BASE_PRIORITY - Math.min(70, listRank * 3 + Math.floor(itemRank / 20));
  return Math.max(
    LIST_MIN_PRIORITY,
    loadPriority === 'prefetch' ? priority - LIST_PREFETCH_PRIORITY_OFFSET : priority
  );
}

export function mediaVisibilityPriority(tier: MediaPriorityRequest['tier']): number {
  return tier === 'viewport' ? VIEWPORT_PRIORITY : LIST_BASE_PRIORITY;
}

/** Local projection of provider-backed list membership. */
export class ListService {
  private readonly mediaListRepository: MediaListRepository;
  private readonly movieRepository;
  private readonly tvShowRepository;
  private readonly listRanks = new Map<string, number>();
  private readonly listDefinitions = new Map<string, ListServiceDefinition>();

  constructor(
    private readonly db: Database,
    private readonly catalogClient: CatalogClientService,
    private readonly listClient: ListClientService,
    private readonly backgroundJobs?: BackgroundJobService
  ) {
    this.mediaListRepository = db.getMediaListRepository();
    this.movieRepository = db.getMovieRepository();
    this.tvShowRepository = db.getTVShowRepository();
  }

  async getLists(subjectId = 'public'): Promise<ListServiceDefinition[]> {
    let lists: ListServiceDefinition[] = [];
    try {
      lists = await this.listClient.getDefinitions(subjectId);
    } catch (error) {
      logger.warn('ListService', 'Unable to load remote list definitions', error);
    }
    if (subjectId !== 'public') {
      const watchlist = await this.getLocalWatchlist(subjectId);
      if (watchlist.total > 0) {
        lists.unshift({
          id: LOCAL_WATCHLIST_SLUG,
          slug: LOCAL_WATCHLIST_SLUG,
          name: 'My watchlist',
          description: 'Titles you added to your watchlist',
          provider: 'local',
          scope: 'personal',
          requiresConnection: false,
        });
      }
    }
    lists.forEach((list, index) => {
      this.listRanks.set(list.slug, list.rank ?? index);
      this.listDefinitions.set(list.slug, list);
    });
    return lists;
  }

  async getPopularLists(page = 1, limit = 20): Promise<ListServiceDefinitionsPage> {
    const result = await this.listClient.getPopularDefinitions(page, limit);
    result.results.forEach((list, index) => {
      this.listRanks.set(list.slug, list.rank ?? (page - 1) * limit + index);
      this.listDefinitions.set(list.slug, list);
    });
    return result;
  }

  @traced('ListService')
  async refreshList(slug: string, maxPages: number, subjectId = 'public'): Promise<void> {
    const mediaList = await this.getOrCreateList(slug, subjectId);
    const generation = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const firstPage = await this.listClient.getPage(subjectId, slug, 1);
      const seen = new Set<string>();
      const resolvePage = async (page: typeof firstPage) => {
        const refs = await this.resolveExternalRefs(page.items.map(item => item.media));
        const summaries = refs.flatMap(({ ref }) => {
          const key = `${ref.mediaType}:${ref.mediaId}`;
          if (seen.has(key)) return [];
          seen.add(key);
          return [
            {
              mediaType: ref.mediaType,
              mediaId: ref.mediaId,
              title: '',
              overview: '',
              poster: '',
              backdrop: '',
              genreIds: [],
              releaseDate: '',
              popularity: 0,
              rating: 0,
            } satisfies MediaSummary,
          ];
        });
        return this.resolveMediaPage(summaries, this.listRank(slug), (page.page - 1) * 50);
      };
      const firstItems = await resolvePage(firstPage);
      await this.mediaListRepository.stagePage(mediaList.id, generation, 0, firstItems);
      const pageLimit = Math.min(firstPage.totalPages, maxPages);
      let offset = firstItems.length;
      for (let page = 2; page <= pageLimit; page++) {
        const result = await this.listClient.getPage(subjectId, slug, page);
        logger.debug('ListService', `List ${slug} obtained page ${page}/${pageLimit}`);
        const items = await resolvePage(result);
        await this.mediaListRepository.stagePage(mediaList.id, generation, offset, items);
        offset += items.length;
      }
      await this.mediaListRepository.activateGeneration(mediaList.id, generation);
    } catch (error) {
      await this.mediaListRepository.discardGeneration(mediaList.id, generation);
      throw error;
    }
  }

  async createRefreshPlan(slug: string, maxPages: number, subjectId = 'public') {
    const [list, firstPage] = await Promise.all([
      this.getOrCreateList(slug, subjectId),
      this.listClient.getPage(subjectId, slug, 1),
    ]);
    return {
      generation: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      listId: list.id,
      pageCount: Math.min(firstPage.totalPages, maxPages),
      pageSize: Math.max(1, firstPage.items.length),
      listRank: this.listRank(slug),
    };
  }

  async stageRefreshPage(
    slug: string,
    listId: number,
    generation: string,
    page: number,
    pageSize: number,
    subjectId = 'public'
  ): Promise<void> {
    const result = await this.listClient.getPage(subjectId, slug, page);
    const refs = await this.resolveExternalRefs(result.items.map(item => item.media));
    const summaries = refs.map(
      ({ ref }) =>
        ({
          mediaType: ref.mediaType,
          mediaId: ref.mediaId,
          title: '',
          overview: '',
          poster: '',
          backdrop: '',
          genreIds: [],
          releaseDate: '',
          popularity: 0,
          rating: 0,
        }) satisfies MediaSummary
    );
    const items = await this.resolveMediaPage(
      summaries,
      this.listRank(slug),
      (page - 1) * pageSize
    );
    await this.mediaListRepository.stagePage(listId, generation, (page - 1) * pageSize, items);
  }

  activateRefreshGeneration(listId: number, generation: string): Promise<void> {
    return this.mediaListRepository.activateGeneration(listId, generation);
  }

  @traced('ListService')
  async getListPage(
    slug: string,
    language = 'en',
    page = 0,
    limit = 20,
    subjectId = 'public',
    loadPriority: ListLoadPriority = 'visible'
  ) {
    if (slug === LOCAL_WATCHLIST_SLUG) {
      return this.getLocalWatchlistPage(language, page, limit, subjectId, loadPriority);
    }
    const list = await this.getOrCreateList(slug, subjectId);
    if (!list.activeGeneration) {
      return this.getOnDemandListPage(slug, language, page, limit, subjectId, loadPriority);
    }
    const [items, total] = await Promise.all([
      this.mediaListRepository.getPage(list.id, list.activeGeneration, page * limit, limit),
      this.mediaListRepository.countItems(list.id, list.activeGeneration),
    ]);
    const refs: MediaRef[] = items.map(item => ({
      mediaType: item.mediaType,
      mediaId: item.mediaId,
    }));
    const batch = await this.catalogClient.batch(refs, language);
    const medias = await this.hydrateMediaDetails(
      batch.items,
      this.listRank(slug),
      page * limit,
      loadPriority
    );
    return { medias, total };
  }

  async getWatchlistMembership(
    subjectId: string,
    mediaType: MediaListItemType,
    mediaId: number
  ): Promise<boolean> {
    const list = await this.getOrCreateLocalWatchlist(subjectId);
    const items = await this.mediaListRepository.getActiveItems(list.id, 'local');
    return items.some(item => item.mediaType === mediaType && item.mediaId === mediaId);
  }

  async addToWatchlist(
    subjectId: string,
    mediaType: MediaListItemType,
    mediaId: number
  ): Promise<void> {
    const list = await this.getOrCreateLocalWatchlist(subjectId);
    await this.mediaListRepository.addItem(list.id, 'local', { mediaType, mediaId });
    void this.prepareWatchlistItem(mediaType, mediaId);
  }

  async removeFromWatchlist(
    subjectId: string,
    mediaType: MediaListItemType,
    mediaId: number
  ): Promise<void> {
    const list = await this.getOrCreateLocalWatchlist(subjectId);
    await this.mediaListRepository.removeItem(list.id, 'local', { mediaType, mediaId });
  }

  private async getLocalWatchlist(subjectId: string) {
    const list = await this.getOrCreateLocalWatchlist(subjectId);
    const total = await this.mediaListRepository.countItems(list.id, 'local');
    return { list, total };
  }

  private async getOrCreateLocalWatchlist(subjectId: string): Promise<MediaList> {
    let list = await this.mediaListRepository.findBySlug(LOCAL_WATCHLIST_SLUG, false, subjectId);
    if (!list) {
      list = await this.mediaListRepository.createMediaList(
        'My watchlist',
        'Titles you added to your watchlist',
        LOCAL_WATCHLIST_SLUG,
        subjectId,
        null
      );
      await this.mediaListRepository.activateGeneration(list.id, 'local');
    }
    return list;
  }

  private async getLocalWatchlistPage(
    language: string,
    page: number,
    limit: number,
    subjectId: string,
    loadPriority: ListLoadPriority
  ) {
    const { list, total } = await this.getLocalWatchlist(subjectId);
    const items = await this.mediaListRepository.getPage(list.id, 'local', page * limit, limit);
    // Retry preparation on reads so temporary catalog or queue outages do not strand local items.
    void Promise.all(items.map(item => this.prepareWatchlistItem(item.mediaType, item.mediaId)));
    const batch = await this.catalogClient.batch(
      items.map(item => ({ mediaType: item.mediaType, mediaId: item.mediaId })),
      language
    );
    const medias = await this.hydrateMediaDetails(batch.items, 0, page * limit, loadPriority);
    return { medias, total };
  }

  private async prepareWatchlistItem(mediaType: MediaListItemType, mediaId: number): Promise<void> {
    try {
      if (mediaType === 'movie') {
        await this.catalogClient.getMovie(mediaId, 'en');
        await this.catalogClient.ensureBackdropFocus('movie', mediaId);
        await this.backgroundJobs?.enqueueBestEffort({
          type: 'watchlist.movie.download',
          dedupeKey: `watchlist:movie:${mediaId}`,
          payload: { movieMediaId: mediaId },
          options: { priority: 50 },
        });
        return;
      }
      await this.catalogClient.getTVShow(mediaId, 'en');
      await this.catalogClient.ensureBackdropFocus('tv', mediaId);
      await this.backgroundJobs?.enqueueBestEffort({
        type: 'catalog.season-sync.seed',
        dedupeKey: `watchlist:show:${mediaId}`,
        payload: { tvMediaId: mediaId, priority: 50 },
        options: { priority: 50 },
      });
      // TODO: When episode sources/playback are supported, predownload the next episode
      // from playback progress using the same storage reserve. Keep this separate from
      // watchlist membership and Continue watching; Trakt may auto-remove watched shows.
    } catch (error) {
      logger.warn('ListService', `Watchlist preparation failed for ${mediaType} ${mediaId}`, error);
    }
  }

  /**
   * Serve a cold list request from only the provider page(s) needed for the
   * requested API page. Full list projection remains the responsibility of
   * the background refresh pipeline.
   */
  private async getOnDemandListPage(
    slug: string,
    language: string,
    page: number,
    limit: number,
    subjectId: string,
    loadPriority: ListLoadPriority
  ) {
    const providerPageSize = 50;
    const start = page * limit;
    const firstProviderPage = Math.floor(start / providerPageSize) + 1;
    const lastProviderPage = Math.floor((start + limit - 1) / providerPageSize) + 1;
    const providerPages = await Promise.all(
      Array.from({ length: lastProviderPage - firstProviderPage + 1 }, (_, index) =>
        this.listClient.getPage(subjectId, slug, firstProviderPage + index)
      )
    );
    const providerItems = providerPages.flatMap(result => result.items);
    const firstItemOffset = start - (firstProviderPage - 1) * providerPageSize;
    const requestedItems = providerItems.slice(firstItemOffset, firstItemOffset + limit);
    const refs = await this.resolveExternalRefs(requestedItems.map(item => item.media));
    const batch = await this.catalogClient.batch(
      refs.map(({ ref }) => ref),
      language
    );
    const medias = await this.hydrateMediaDetails(
      batch.items,
      this.listRank(slug),
      start,
      loadPriority
    );
    return { medias, total: providerPages[0]?.totalItems ?? 0 };
  }

  getListContent(slug: string, language = 'en', subjectId = 'public') {
    return this.getListPage(slug, language, 0, 10_000, subjectId).then(result => result.medias);
  }

  private async resolveMediaPage(
    medias: MediaSummary[],
    listRank: number,
    itemOffset: number
  ): Promise<Array<{ mediaType: MediaListItemType; mediaId: number }>> {
    const refs: MediaRef[] = medias.map(media => ({
      mediaType: media.mediaType,
      mediaId: media.mediaId,
    }));
    try {
      const batch = await this.catalogClient.batch(refs, 'en');
      const hydrated = await this.hydrateMediaDetails(batch.items, listRank, itemOffset);
      return hydrated.map(detail => ({ mediaType: detail.mediaType, mediaId: detail.mediaId }));
    } catch (error) {
      logger.warn('ListService', 'Catalog batch failed while projecting a list page', error);
      throw error;
    }
  }

  private async hydrateMediaDetails(
    details: Array<MovieDetail | TVShowDetail>,
    listRank = 0,
    itemOffset = 0,
    loadPriority: ListLoadPriority = 'visible'
  ): Promise<Array<{ localId: number } & (MovieDetail | TVShowDetail)>> {
    const resolved: Array<{ localId: number } & (MovieDetail | TVShowDetail)> = [];
    for (const detail of details) {
      try {
        if (detail.mediaType === 'movie') {
          const local = await this.movieRepository.upsertMovieDetail(detail);
          this.backgroundJobs?.enqueueBestEffort({
            type: 'source.discover',
            dedupeKey: `media:${detail.mediaId}`,
            payload: {
              movieMediaId: detail.mediaId,
              priority: listDownstreamPriority(
                listRank,
                itemOffset + resolved.length,
                loadPriority
              ),
            },
            options: {
              priority: listDownstreamPriority(
                listRank,
                itemOffset + resolved.length,
                loadPriority
              ),
            },
          });
          resolved.push({ ...detail, localId: local.id });
        } else {
          const local = await this.tvShowRepository.upsertTVShowDetail(detail);
          this.backgroundJobs?.enqueueBestEffort({
            type: 'catalog.season-sync.seed',
            dedupeKey: `show:${detail.mediaId}`,
            payload: {
              tvMediaId: detail.mediaId,
              priority: listDownstreamPriority(
                listRank,
                itemOffset + resolved.length,
                loadPriority
              ),
            },
            options: {
              priority: listDownstreamPriority(
                listRank,
                itemOffset + resolved.length,
                loadPriority
              ),
            },
          });
          resolved.push({ ...detail, localId: local.id });
        }
      } catch (error) {
        logger.warn(
          'ListService',
          `Skipping ${detail.mediaType} ${detail.mediaId} while projecting`,
          error
        );
      }
    }
    return resolved;
  }

  async promoteMediaPriorities(items: MediaPriorityRequest[]): Promise<void> {
    if (!this.backgroundJobs) return;
    await Promise.all(
      items.map(item => {
        const priority = mediaVisibilityPriority(item.tier);
        if (item.mediaType === 'movie') {
          return this.backgroundJobs!.enqueueOrPromote(
            'source.discover',
            `media:${item.mediaId}`,
            { movieMediaId: item.mediaId, priority },
            { priority }
          );
        }
        return this.backgroundJobs!.enqueueOrPromote(
          'catalog.season-sync.seed',
          `show:${item.mediaId}`,
          { tvMediaId: item.mediaId, priority },
          { priority }
        );
      })
    );
  }

  private async resolveExternalRefs(
    items: Array<{
      mediaType: 'movie' | 'tv';
      ids: { tmdb?: number; imdb?: string; trakt?: number };
    }>
  ): Promise<Array<{ ref: MediaRef }>> {
    const direct = items.map(item => ({ item, mediaId: item.ids.tmdb }));
    const lookups: ExternalMediaLookup[] = direct
      .filter(entry => entry.mediaId === undefined && entry.item.ids.imdb)
      .map(entry => ({ mediaType: entry.item.mediaType, ids: { imdb: entry.item.ids.imdb } }));
    const resolved = lookups.length ? await this.catalogClient.resolveExternal(lookups) : [];
    let lookupIndex = 0;
    return direct.flatMap(entry => {
      if (entry.mediaId !== undefined)
        return [{ ref: { mediaType: entry.item.mediaType, mediaId: entry.mediaId } }];
      if (!entry.item.ids.imdb) return [];
      const match = resolved[lookupIndex++];
      return match?.media ? [{ ref: match.media }] : [];
    });
  }

  private async getOrCreateList(slug: string, ownerKey = 'public'): Promise<MediaList> {
    if (slug === LOCAL_WATCHLIST_SLUG && ownerKey !== 'public') {
      return this.getOrCreateLocalWatchlist(ownerKey);
    }
    const definition =
      this.listDefinitions.get(slug) ??
      (await this.listClient.getDefinitions(ownerKey)).find(item => item.slug === slug);
    if (definition) this.listDefinitions.set(slug, definition);
    const resolvedDefinition =
      definition ??
      (/^trakt-community-.+-\d+$/.test(slug)
        ? {
            id: slug,
            slug,
            name: 'Trakt community list',
            description: 'Popular list from Trakt',
            provider: 'trakt',
            scope: 'public' as const,
            requiresConnection: false,
          }
        : undefined);
    if (!resolvedDefinition)
      throw new MediaError(`List with slug ${slug} not found`, 'list_not_found');
    const actualOwner = resolvedDefinition.scope === 'public' ? 'public' : ownerKey;
    let list = await this.mediaListRepository.findBySlug(slug, false, actualOwner);
    if (!list) {
      list = await this.mediaListRepository.createMediaList(
        resolvedDefinition.name,
        resolvedDefinition.description,
        slug,
        actualOwner,
        resolvedDefinition.id
      );
    }
    return list;
  }

  private listRank(slug: string): number {
    return this.listRanks.get(slug) ?? 19;
  }

  private async getListBySlug(slug: string, ownerKey = 'public'): Promise<MediaList> {
    const list = await this.getOrCreateList(slug, ownerKey);
    if (!list.activeGeneration) {
      await this.refreshList(slug, DEFAULT_LIST_REFRESH_PAGES, ownerKey);
      return this.getOrCreateList(slug, ownerKey);
    }
    return list;
  }
}
