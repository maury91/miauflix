import { logger } from '@logger';
import type { ListServiceDefinition } from '@miauflix/service-contracts';

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

/** Local projection of provider-backed list membership. */
export class ListService {
  private readonly mediaListRepository: MediaListRepository;
  private readonly movieRepository;
  private readonly tvShowRepository;

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

  getLists(subjectId = 'public'): Promise<ListServiceDefinition[]> {
    return this.listClient.getDefinitions(subjectId);
  }

  @traced('ListService')
  async refreshList(slug: string, maxPages: number, subjectId = 'public'): Promise<void> {
    const mediaList = await this.getOrCreateList(slug, subjectId);
    const generation = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const firstPage = await this.listClient.getPage(subjectId, slug, 1);
      const seen = new Set<string>();
      const resolvePage = async (page: typeof firstPage, priority: number) => {
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
        return this.resolveMediaPage(summaries, priority);
      };
      const firstItems = await resolvePage(firstPage, 80);
      await this.mediaListRepository.stagePage(mediaList.id, generation, 0, firstItems);
      const pageLimit = Math.min(firstPage.totalPages, maxPages);
      let offset = firstItems.length;
      for (let page = 2; page <= pageLimit; page++) {
        const result = await this.listClient.getPage(subjectId, slug, page);
        logger.debug('ListService', `List ${slug} obtained page ${page}/${pageLimit}`);
        const items = await resolvePage(result, 50);
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
    const items = await this.resolveMediaPage(summaries, page === 1 ? 80 : 50);
    await this.mediaListRepository.stagePage(listId, generation, (page - 1) * pageSize, items);
  }

  activateRefreshGeneration(listId: number, generation: string): Promise<void> {
    return this.mediaListRepository.activateGeneration(listId, generation);
  }

  @traced('ListService')
  async getListPage(slug: string, language = 'en', page = 0, limit = 20, subjectId = 'public') {
    const list = await this.getListBySlug(slug, subjectId);
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
    const details = new Map(
      batch.items.map(detail => [`${detail.mediaType}:${detail.mediaId}`, detail])
    );
    const localMovies = await this.movieRepository.findListItemsByMediaIds(
      items.filter(item => item.mediaType === 'movie').map(item => item.mediaId)
    );
    const localShows = await this.tvShowRepository.findListItemsByMediaIds(
      items.filter(item => item.mediaType === 'tv').map(item => item.mediaId)
    );
    const localIds = new Map<string, number>();
    for (const movie of localMovies) localIds.set(`movie:${movie.mediaId}`, movie.id);
    for (const show of localShows) localIds.set(`tv:${show.mediaId}`, show.id);
    const medias = items.flatMap(item => {
      const detail = details.get(`${item.mediaType}:${item.mediaId}`);
      const localId = localIds.get(`${item.mediaType}:${item.mediaId}`);
      return detail && localId !== undefined ? [{ ...detail, localId }] : [];
    });
    return { medias, total };
  }

  getListContent(slug: string, language = 'en', subjectId = 'public') {
    return this.getListPage(slug, language, 0, 10_000, subjectId).then(result => result.medias);
  }

  private async resolveMediaPage(
    medias: MediaSummary[],
    priority: number
  ): Promise<Array<{ mediaType: MediaListItemType; mediaId: number }>> {
    const refs: MediaRef[] = medias.map(media => ({
      mediaType: media.mediaType,
      mediaId: media.mediaId,
    }));
    const details = new Map<string, MovieDetail | TVShowDetail>();
    try {
      const batch = await this.catalogClient.batch(refs, 'en');
      for (const detail of batch.items)
        details.set(`${detail.mediaType}:${detail.mediaId}`, detail);
    } catch (error) {
      logger.warn('ListService', 'Catalog batch failed while projecting a list page', error);
      throw error;
    }
    const resolved: Array<{ mediaType: MediaListItemType; mediaId: number }> = [];
    for (const media of medias) {
      try {
        const detail = details.get(`${media.mediaType}:${media.mediaId}`);
        if (media.mediaType === 'movie') {
          if (detail?.mediaType !== 'movie') continue;
          await this.movieRepository.upsertMovieDetail(detail);
          this.backgroundJobs?.enqueueBestEffort({
            type: 'source.discover',
            dedupeKey: `media:${media.mediaId}`,
            payload: { movieMediaId: media.mediaId },
            options: { priority: Math.max(1, priority - 20) },
          });
        } else {
          if (detail?.mediaType !== 'tv') continue;
          await this.tvShowRepository.upsertTVShowDetail(detail);
        }
        resolved.push({ mediaType: media.mediaType, mediaId: media.mediaId });
      } catch (error) {
        logger.warn(
          'ListService',
          `Skipping ${media.mediaType} ${media.mediaId} while projecting`,
          error
        );
      }
    }
    return resolved;
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
    const definition = (await this.listClient.getDefinitions(ownerKey)).find(
      item => item.slug === slug
    );
    if (!definition) throw new MediaError(`List with slug ${slug} not found`, 'list_not_found');
    const actualOwner = definition.scope === 'public' ? 'public' : ownerKey;
    let list = await this.mediaListRepository.findBySlug(slug, false, actualOwner);
    if (!list) {
      list = await this.mediaListRepository.createMediaList(
        definition.name,
        definition.description,
        slug,
        actualOwner,
        definition.id
      );
    }
    return list;
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
