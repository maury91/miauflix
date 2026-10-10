jest.mock('@database/database');

import { configureFakerSeed } from '@__test-utils__/utils';

import { Database } from '@database/database';
import type { MediaListRepository } from '@repositories/mediaList.repository';
import type { BackgroundJobService } from '@services/background-job/background-job.service';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';
import type { ListClientService } from '@services/list/list-client.service';

import { DEFAULT_LIST_REFRESH_PAGES, listDownstreamPriority, ListService } from './list.service';

const publicDefinition = {
  id: 'trakt-movies-popular',
  slug: 'trakt-movies-popular',
  name: 'Popular Movies',
  description: '',
  provider: 'trakt',
  scope: 'public' as const,
  requiresConnection: false,
};

const setupTest = () => {
  const database = new Database({} as never) as jest.Mocked<Database>;
  const mediaListRepository = database.getMediaListRepository() as jest.Mocked<MediaListRepository>;
  const listClient = {
    getDefinitions: jest.fn().mockResolvedValue([publicDefinition]),
    getPage: jest.fn().mockResolvedValue({
      listId: publicDefinition.id,
      page: 1,
      totalPages: 1,
      totalItems: 0,
      items: [],
    }),
  } as unknown as jest.Mocked<ListClientService>;
  const catalogClient = {
    batch: jest.fn().mockResolvedValue({ items: [] }),
  } as unknown as jest.Mocked<CatalogClientService>;
  mediaListRepository.discardGeneration = jest.fn().mockResolvedValue(undefined);
  mediaListRepository.findOrCreateMediaList = jest
    .fn()
    .mockImplementation(
      async (
        name: string,
        description: string,
        slug: string,
        ownerKey = 'public',
        remoteListId = slug
      ) => ({
        id: 1,
        name,
        description,
        slug,
        ownerKey,
        remoteListId,
        activeGeneration: null,
      })
    );
  mediaListRepository.stagePage = jest.fn().mockResolvedValue(undefined);
  mediaListRepository.activateGeneration = jest.fn().mockResolvedValue(undefined);
  database.getMovieRepository().findListItemsByMediaIds = jest.fn().mockResolvedValue([]);
  database.getTVShowRepository().findListItemsByMediaIds = jest.fn().mockResolvedValue([]);
  return {
    database,
    mediaListRepository,
    listClient,
    catalogClient,
    service: new ListService(database, catalogClient, listClient),
  };
};

describe('ListService refresh safety', () => {
  beforeAll(() => {
    configureFakerSeed();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps prefetched downstream work below visible work', () => {
    expect(listDownstreamPriority(0, 0, 'prefetch')).toBeLessThan(
      listDownstreamPriority(0, 0, 'visible')
    );
  });

  it('discards a failed generation without activating it', async () => {
    const { catalogClient, mediaListRepository, service } = setupTest();
    const mediaList = {
      id: 1,
      activeGeneration: 'previous-generation',
    } as never;

    catalogClient.batch.mockRejectedValueOnce(new Error('catalog unavailable'));
    mediaListRepository.findBySlug = jest.fn().mockResolvedValue(mediaList);

    await expect(service.refreshList('trakt-movies-popular', 1)).rejects.toThrow(
      'catalog unavailable'
    );
    expect(mediaListRepository.discardGeneration).toHaveBeenCalledWith(1, expect.any(String));
    expect(mediaListRepository.activateGeneration).not.toHaveBeenCalled();
  });

  it('hydrates every configured page for a personal list', async () => {
    const { listClient, mediaListRepository, service } = setupTest();
    const definition = {
      id: 'personal-list',
      slug: 'personal-list',
      name: 'Personal List',
      description: '',
      provider: 'trakt',
      scope: 'personal' as const,
      requiresConnection: true,
    };
    listClient.getDefinitions.mockResolvedValueOnce([definition]);
    listClient.getPage.mockImplementation(async (_subjectId, _slug, page) => ({
      listId: definition.id,
      page,
      totalPages: 2,
      totalItems: 0,
      items: [],
    }));
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValue({ id: 1, activeGeneration: null } as never);

    await service.refreshList('personal-list', DEFAULT_LIST_REFRESH_PAGES, 'user-1');

    expect(listClient.getPage).toHaveBeenNthCalledWith(1, 'user-1', 'personal-list', 1);
    expect(listClient.getPage).toHaveBeenNthCalledWith(2, 'user-1', 'personal-list', 2);
    expect(mediaListRepository.activateGeneration).toHaveBeenCalledWith(1, expect.any(String));
  });

  it('queues movie source discovery and TV season hydration for every returned item', async () => {
    const { database, listClient, catalogClient, mediaListRepository } = setupTest();
    const backgroundJobs = {
      enqueueBestEffort: jest.fn(),
    } as unknown as jest.Mocked<BackgroundJobService>;
    const movieRepository = database.getMovieRepository();
    const tvShowRepository = database.getTVShowRepository();
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValue({ id: 1, activeGeneration: null } as never);
    listClient.getPage.mockResolvedValue({
      listId: publicDefinition.id,
      page: 1,
      totalPages: 1,
      totalItems: 4,
      items: [
        { media: { mediaType: 'movie', ids: { tmdb: 101 } } },
        { media: { mediaType: 'tv', ids: { tmdb: 202 } } },
        { media: { mediaType: 'movie', ids: { tmdb: 303 } } },
        { media: { mediaType: 'tv', ids: { tmdb: 404 } } },
      ],
    } as never);
    catalogClient.batch.mockResolvedValue({
      items: [
        { mediaType: 'movie', mediaId: 101 },
        { mediaType: 'tv', mediaId: 202 },
        { mediaType: 'movie', mediaId: 303 },
        { mediaType: 'tv', mediaId: 404 },
      ],
    } as never);
    movieRepository.upsertMovieDetails = jest.fn().mockResolvedValue([
      { id: 11, mediaId: 101 },
      { id: 33, mediaId: 303 },
    ]);
    tvShowRepository.upsertTVShowDetails = jest.fn().mockResolvedValue([
      { id: 22, mediaId: 202 },
      { id: 44, mediaId: 404 },
    ]);
    const service = new ListService(database, catalogClient, listClient, backgroundJobs);

    const result = await service.getListPage('trakt-movies-popular', 'en', 0, 20);

    expect(result.medias).toHaveLength(4);
    expect(backgroundJobs.enqueueBestEffort).toHaveBeenNthCalledWith(1, {
      type: 'source.discover',
      dedupeKey: 'media:101',
      payload: { movieMediaId: 101, priority: 33 },
      options: { priority: 33 },
    });
    expect(backgroundJobs.enqueueBestEffort).toHaveBeenNthCalledWith(2, {
      type: 'catalog.season-sync.seed',
      dedupeKey: 'show:202',
      payload: { tvMediaId: 202, priority: 33 },
      options: { priority: 33 },
    });
    expect(backgroundJobs.enqueueBestEffort).toHaveBeenNthCalledWith(3, {
      type: 'source.discover',
      dedupeKey: 'media:303',
      payload: { movieMediaId: 303, priority: 33 },
      options: { priority: 33 },
    });
    expect(backgroundJobs.enqueueBestEffort).toHaveBeenNthCalledWith(4, {
      type: 'catalog.season-sync.seed',
      dedupeKey: 'show:404',
      payload: { tvMediaId: 404, priority: 33 },
      options: { priority: 33 },
    });
  });

  it('retries individual entries when a bulk projection fails', async () => {
    const { database, listClient, catalogClient, mediaListRepository } = setupTest();
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValue({ id: 1, activeGeneration: null } as never);
    listClient.getPage.mockResolvedValue({
      listId: publicDefinition.id,
      page: 1,
      totalPages: 1,
      totalItems: 2,
      items: [
        { media: { mediaType: 'movie', ids: { tmdb: 101 } } },
        { media: { mediaType: 'movie', ids: { tmdb: 202 } } },
      ],
    } as never);
    catalogClient.batch.mockResolvedValue({
      items: [
        { mediaType: 'movie', mediaId: 101 },
        { mediaType: 'movie', mediaId: 202 },
      ],
    } as never);
    const movieRepository = database.getMovieRepository();
    (movieRepository.upsertMovieDetails as jest.Mock).mockRejectedValueOnce(
      new Error('bulk write failed')
    );
    movieRepository.upsertMovieDetail = jest
      .fn()
      .mockResolvedValueOnce({ id: 11, mediaId: 101 } as never)
      .mockRejectedValueOnce(new Error('one record failed'));
    const service = new ListService(database, catalogClient, listClient);

    const result = await service.getListPage('trakt-movies-popular', 'en', 0, 20);

    expect(result.medias.map(media => media.mediaId)).toEqual([101]);
    expect(movieRepository.upsertMovieDetail).toHaveBeenCalledTimes(2);
  });

  it('maps viewport and visible requests to queue promotion priorities', async () => {
    const { database, listClient } = setupTest();
    const backgroundJobs = {
      enqueueOrPromote: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BackgroundJobService>;
    const service = new ListService(
      database,
      {} as jest.Mocked<CatalogClientService>,
      listClient,
      backgroundJobs
    );

    await service.promoteMediaPriorities([
      { mediaType: 'movie', mediaId: 101, tier: 'viewport' },
      { mediaType: 'tv', mediaId: 202, tier: 'visible' },
    ]);

    expect(backgroundJobs.enqueueOrPromote).toHaveBeenNthCalledWith(
      1,
      'source.discover',
      'media:101',
      { movieMediaId: 101, priority: 100 },
      { priority: 100 }
    );
    expect(backgroundJobs.enqueueOrPromote).toHaveBeenNthCalledWith(
      2,
      'catalog.season-sync.seed',
      'show:202',
      { tvMediaId: 202, priority: 90 },
      { priority: 90 }
    );
  });
});
