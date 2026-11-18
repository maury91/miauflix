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

/** The catalog returns every requested movie except `missing`, and the projection stores them all. */
const echoCatalog = (
  catalogClient: jest.Mocked<CatalogClientService>,
  database: jest.Mocked<Database>,
  missing: number[] = []
) => {
  catalogClient.batch.mockImplementation(
    async refs =>
      ({
        items: refs.filter(ref => !missing.includes(ref.mediaId)),
      }) as never
  );
  database.getMovieRepository().upsertMovieDetails = jest
    .fn()
    .mockImplementation(async (details: Array<{ mediaId: number }>) =>
      details.map(detail => ({ id: detail.mediaId, mediaId: detail.mediaId }))
    );
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

  it('answers a cold page past a shrunken list with its total, and fails on provider errors', async () => {
    const { database, listClient, catalogClient, mediaListRepository } = setupTest();
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValue({ id: 1, activeGeneration: null } as never);
    const firstPage = {
      listId: publicDefinition.id,
      page: 1,
      totalPages: 1,
      totalItems: 40,
      items: Array.from({ length: 40 }, (_, index) => ({
        media: { mediaType: 'movie', ids: { tmdb: 1000 + index } },
      })),
    };
    listClient.getPage.mockImplementation(async (_subject, _slug, page) => {
      if (page === 1) return firstPage as never;
      throw new Error('page out of range');
    });
    echoCatalog(catalogClient, database);
    const service = new ListService(database, catalogClient, listClient);

    // Zero-based page 2 of 20 (cards 40-59) is past the 40 cards: the total, and no items
    const past = await service.getListPage('trakt-movies-popular', 'en', 2, 20);
    expect(past.total).toBe(40);
    expect(past.medias).toEqual([]);
    // Zero-based page 3 (cards 60-79): no catalog work for no cards
    catalogClient.batch.mockClear();
    catalogClient.batch.mockRejectedValue(new Error('catalog not ready'));
    const further = await service.getListPage('trakt-movies-popular', 'en', 3, 20);
    expect(further).toEqual({ medias: [], total: 40 });
    expect(catalogClient.batch).not.toHaveBeenCalled();
    // The provider is never asked for a page past its last
    expect(listClient.getPage.mock.calls.every(([, , page]) => page === 1)).toBe(true);

    // A page within the list that fails is an error, never an empty page
    listClient.getPage.mockImplementation(async (_subject, _slug, page) => {
      if (page === 1) return { ...firstPage, totalPages: 2, totalItems: 60 } as never;
      throw new Error('provider timed out');
    });
    await expect(service.getListPage('trakt-movies-popular', 'en', 2, 20)).rejects.toThrow(
      'provider timed out'
    );
    listClient.getPage.mockRejectedValue(new Error('provider down'));
    await expect(service.getListPage('trakt-movies-popular', 'en', 0, 20)).rejects.toThrow(
      'provider down'
    );
  });

  it('fills unstored list pages past the items a provider page dropped', async () => {
    const { database, listClient, catalogClient, mediaListRepository, service } = setupTest();
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValue({ id: 1, activeGeneration: null } as never);
    // 120 provider entries over 3 pages; only 21, 30 and 10 of them are movies (a list of episodes)
    const kept = [21, 30, 10];
    let next = 1;
    const pages = kept.map(count =>
      Array.from({ length: count }, () => {
        const tmdb = next++;
        return {
          key: `movie:${tmdb}`,
          rank: tmdb,
          media: { mediaType: 'movie' as const, ids: { tmdb } },
        };
      })
    );
    listClient.getPage.mockImplementation(async (_subjectId, _slug, page) => ({
      listId: 'trakt-community-1',
      page,
      totalPages: 3,
      totalItems: 120,
      items: pages[page - 1],
    }));

    echoCatalog(catalogClient, database);

    const result = await service.getListPage('trakt-community-1', 'en', 1, 20);

    expect(result.medias.map(media => media.mediaId)).toEqual(
      Array.from({ length: 20 }, (_, index) => 21 + index)
    );
    expect(result.total).toBe(61);
  });

  it('keeps the provider estimate when a page read only to count the total fails', async () => {
    const { database, listClient, catalogClient, mediaListRepository, service } = setupTest();
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValue({ id: 1, activeGeneration: null } as never);
    // The first page drops 10 of its 50 entries but still fills the requested 20 cards
    listClient.getPage.mockImplementation(async (_subjectId, _slug, page) => {
      if (page !== 1) throw new Error('provider page unavailable');
      return {
        listId: 'trakt-community-1',
        page,
        totalPages: 3,
        totalItems: 150,
        items: Array.from({ length: 40 }, (_, index) => ({
          key: `movie:${index + 1}`,
          rank: index + 1,
          media: { mediaType: 'movie' as const, ids: { tmdb: index + 1 } },
        })),
      };
    });
    echoCatalog(catalogClient, database);

    const result = await service.getListPage('trakt-community-1', 'en', 0, 20);

    expect(result.medias.map(media => media.mediaId)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1)
    );
    expect(result.total).toBe(140);
  });

  it('resolves an unstored list in catalog batches of at most 50 titles', async () => {
    const { database, listClient, catalogClient, mediaListRepository, service } = setupTest();
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValue({ id: 1, activeGeneration: null } as never);
    listClient.getPage.mockImplementation(async (_subjectId, _slug, page) => ({
      listId: 'trakt-community-1',
      page,
      totalPages: 3,
      totalItems: 150,
      items: Array.from({ length: 50 }, (_, index) => {
        const tmdb = (page - 1) * 50 + index + 1;
        return {
          key: `movie:${tmdb}`,
          rank: tmdb,
          media: { mediaType: 'movie' as const, ids: { tmdb } },
        };
      }),
    }));
    echoCatalog(catalogClient, database);

    const result = await service.getListPage('trakt-community-1', 'en', 0, 120);

    expect(result.medias.map(media => media.mediaId)).toEqual(
      Array.from({ length: 120 }, (_, index) => index + 1)
    );
    expect(catalogClient.batch.mock.calls.every(([refs]) => refs.length <= 50)).toBe(true);
  });

  it('refills a remembered page when the catalog stops returning one of its titles', async () => {
    const { database, listClient, catalogClient, mediaListRepository, service } = setupTest();
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValue({ id: 1, activeGeneration: null } as never);
    listClient.getPage.mockResolvedValue({
      listId: 'trakt-community-1',
      page: 1,
      totalPages: 1,
      totalItems: 5,
      items: Array.from({ length: 5 }, (_, index) => ({
        key: `movie:${index + 1}`,
        rank: index + 1,
        media: { mediaType: 'movie' as const, ids: { tmdb: index + 1 } },
      })),
    });
    echoCatalog(catalogClient, database);
    const first = await service.getListPage('trakt-community-1', 'en', 0, 2);
    expect(first.medias.map(media => media.mediaId)).toEqual([1, 2]);

    // The remembered order still holds title 2, which the catalog no longer returns
    echoCatalog(catalogClient, database, [2]);
    const again = await service.getListPage('trakt-community-1', 'en', 0, 2);

    expect(again.medias.map(media => media.mediaId)).toEqual([1, 3]);
    const next = await service.getListPage('trakt-community-1', 'en', 1, 2);
    expect(next.medias.map(media => media.mediaId)).toEqual([4, 5]);
  });

  it('keeps the place of a title the catalog failed to load for now', async () => {
    const { database, listClient, catalogClient, mediaListRepository, service } = setupTest();
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValue({ id: 1, activeGeneration: null } as never);
    listClient.getPage.mockResolvedValue({
      listId: 'trakt-community-1',
      page: 1,
      totalPages: 1,
      totalItems: 5,
      items: Array.from({ length: 5 }, (_, index) => ({
        key: `movie:${index + 1}`,
        rank: index + 1,
        media: { mediaType: 'movie' as const, ids: { tmdb: index + 1 } },
      })),
    });
    echoCatalog(catalogClient, database);
    // Title 2 fails (a timeout), it is not unknown
    catalogClient.batch.mockImplementation(
      async refs =>
        ({
          items: refs.filter(ref => ref.mediaId !== 2),
          missing: [],
          errors: refs
            .filter(ref => ref.mediaId === 2)
            .map(ref => ({ ref, error: 'catalog_batch_item_failed' })),
        }) as never
    );

    const first = await service.getListPage('trakt-community-1', 'en', 0, 3);
    expect(first.medias.map(media => media.mediaId)).toEqual([1, 3]);

    // Once the catalog recovers, title 2 is back in its place and nothing moved past it
    echoCatalog(catalogClient, database);
    const again = await service.getListPage('trakt-community-1', 'en', 0, 3);
    expect(again.medias.map(media => media.mediaId)).toEqual([1, 2, 3]);
    const next = await service.getListPage('trakt-community-1', 'en', 1, 3);
    expect(next.medias.map(media => media.mediaId)).toEqual([4, 5]);
  });

  it('forgets expired list orders and keeps at most 200', async () => {
    const { database, listClient, catalogClient, mediaListRepository, service } = setupTest();
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValue({ id: 1, activeGeneration: null } as never);
    listClient.getPage.mockImplementation(async (_subjectId, slug) => ({
      listId: slug,
      page: 1,
      totalPages: 1,
      totalItems: 1,
      items: [
        { key: 'movie:1', rank: 1, media: { mediaType: 'movie' as const, ids: { tmdb: 1 } } },
      ],
    }));
    echoCatalog(catalogClient, database);
    const orders = (service as unknown as { onDemandOrders: Map<string, unknown> }).onDemandOrders;
    const start = new Date('2026-01-01T00:00:00.000Z').getTime();
    jest.setSystemTime(new Date(start));
    try {
      for (let list = 0; list < 205; list++) {
        await service.getListPage(`trakt-community-${list}`, 'en', 0, 1);
      }
      expect(orders.size).toBe(200);
      // The oldest went first
      expect(orders.has('public:trakt-community-0')).toBe(false);
      expect(orders.has('public:trakt-community-204')).toBe(true);

      jest.setSystemTime(new Date(start + 5 * 60 * 1000));
      await service.getListPage('trakt-community-1000', 'en', 0, 1);
      expect([...orders.keys()]).toEqual(['public:trakt-community-1000']);
    } finally {
      jest.setSystemTime();
    }
  });

  it('serves a short page when a provider page needed to fill it fails', async () => {
    const { database, listClient, catalogClient, mediaListRepository, service } = setupTest();
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValue({ id: 1, activeGeneration: null } as never);
    // Only 12 of the first page's 50 entries are kept: filling 20 cards needs page 2, which fails
    const providerError = new Error('provider page unavailable');
    listClient.getPage.mockImplementation(async (_subjectId, _slug, page) => {
      if (page !== 1) throw providerError;
      return {
        listId: 'trakt-community-1',
        page,
        totalPages: 3,
        totalItems: 150,
        items: Array.from({ length: 12 }, (_, index) => ({
          key: `movie:${index + 1}`,
          rank: index + 1,
          media: { mediaType: 'movie' as const, ids: { tmdb: index + 1 } },
        })),
      };
    });
    catalogClient.batch.mockImplementation(async refs => ({
      items: [],
      missing: [],
      errors: refs.map(ref => ({ ref, error: 'catalog_batch_item_failed' })),
    }));
    await expect(service.getListPage('trakt-community-1', 'en', 0, 20)).rejects.toBe(providerError);

    // The catalog can recover the remembered references even while the provider is still failing.
    echoCatalog(catalogClient, database);
    const result = await service.getListPage('trakt-community-1', 'en', 0, 20);
    expect(result.medias.map(media => media.mediaId)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1)
    );
    // Rows page by index: the short page ends the list for now, or the next page (cards 20-39)
    // would skip the entries 13-20 that page 2 holds
    expect(result.total).toBe(12);

    // The next page has nothing in hand, so the same failure is an error, not an empty page
    await expect(service.getListPage('trakt-community-1', 'en', 1, 20)).rejects.toThrow(
      'provider page unavailable'
    );
  });

  it('fills unstored list pages past the items the catalog did not return', async () => {
    const { database, listClient, catalogClient, mediaListRepository, service } = setupTest();
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValue({ id: 1, activeGeneration: null } as never);
    const items = Array.from({ length: 50 }, (_, index) => ({
      key: `movie:${index + 1}`,
      rank: index,
      media: { mediaType: 'movie' as const, ids: { tmdb: index + 1 } },
    }));
    listClient.getPage.mockResolvedValue({
      listId: 'trakt-community-2',
      page: 1,
      totalPages: 1,
      totalItems: 50,
      items,
    });
    // The catalog can't find item 7
    echoCatalog(catalogClient, database, [7]);

    const first = await service.getListPage('trakt-community-2', 'en', 0, 20);
    const second = await service.getListPage('trakt-community-2', 'en', 1, 20);

    expect(first.medias.map(media => media.mediaId)).toEqual([
      ...Array.from({ length: 6 }, (_, index) => index + 1),
      ...Array.from({ length: 14 }, (_, index) => index + 8),
    ]);
    expect(second.medias.map(media => media.mediaId)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 22)
    );
    expect(second.total).toBe(49);
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

describe('ListService.getMediaByRefs', () => {
  it('loads every title in one catalog batch and keeps the order asked for', async () => {
    const { database, listClient, catalogClient } = setupTest();
    const backgroundJobs = {
      enqueueBestEffort: jest.fn(),
    } as unknown as jest.Mocked<BackgroundJobService>;
    // The catalog answers in its own order and without titles it does not know.
    catalogClient.batch.mockResolvedValue({
      items: [
        { mediaType: 'movie', mediaId: 101 },
        { mediaType: 'tv', mediaId: 202 },
      ],
      missing: [{ mediaType: 'movie', mediaId: 303 }],
      errors: [],
    } as never);
    database.getMovieRepository().upsertMovieDetails = jest
      .fn()
      .mockResolvedValue([{ id: 11, mediaId: 101 }]);
    database.getTVShowRepository().upsertTVShowDetails = jest
      .fn()
      .mockResolvedValue([{ id: 22, mediaId: 202 }]);
    const service = new ListService(database, catalogClient, listClient, backgroundJobs);
    const refs = [
      { mediaType: 'tv' as const, mediaId: 202 },
      { mediaType: 'movie' as const, mediaId: 303 },
      { mediaType: 'movie' as const, mediaId: 101 },
    ];

    const medias = await service.getMediaByRefs(refs, 'it');

    expect(catalogClient.batch).toHaveBeenCalledTimes(1);
    expect(catalogClient.batch).toHaveBeenCalledWith(refs, 'it', 'returned');
    expect(medias.map(media => [media.mediaType, media.mediaId, media.localId])).toEqual([
      ['tv', 202, 22],
      ['movie', 101, 11],
    ]);
    expect(backgroundJobs.enqueueBestEffort).toHaveBeenCalledTimes(2);
  });

  it('returns a title asked for twice in both positions', async () => {
    const { database, listClient, catalogClient } = setupTest();
    echoCatalog(catalogClient, database);
    const service = new ListService(database, catalogClient, listClient);
    const refs = [
      { mediaType: 'movie' as const, mediaId: 101 },
      { mediaType: 'movie' as const, mediaId: 202 },
      { mediaType: 'movie' as const, mediaId: 101 },
    ];

    const medias = await service.getMediaByRefs(refs);

    expect(medias.map(media => media.mediaId)).toEqual([101, 202, 101]);
  });

  it('does not call the catalog for no titles', async () => {
    const { catalogClient, service } = setupTest();
    expect(await service.getMediaByRefs([])).toEqual([]);
    expect(catalogClient.batch).not.toHaveBeenCalled();
  });
});

describe('ListService.getListsPage', () => {
  const popularDefinition = (slug: string) => ({ ...publicDefinition, id: slug, slug, name: slug });
  const popularPage = (page: number, slugs: string[]) => ({
    results: slugs.map(popularDefinition),
    page,
    pageSize: 20,
    totalPages: 3,
    totalItems: 45,
  });

  it('opens the first page with the fixed lists, then the popular ones not already shown', async () => {
    const { service, listClient } = setupTest();
    listClient.getPopularDefinitions = jest
      .fn()
      .mockResolvedValue(popularPage(1, ['trakt-movies-popular', 'marvel']));

    const result = await service.getListsPage('public', 0, 20);

    expect(listClient.getPopularDefinitions).toHaveBeenCalledWith(1, 20);
    expect(result.results.map(list => list.slug)).toEqual(['trakt-movies-popular', 'marvel']);
    expect(result).toMatchObject({ totalItems: 46, totalPages: 3 });
  });

  it('serves only popular lists after the first page, skipping the fixed ones', async () => {
    const { service, listClient } = setupTest();
    listClient.getPopularDefinitions = jest
      .fn()
      .mockResolvedValue(popularPage(2, ['dc', 'trakt-movies-popular']));

    const result = await service.getListsPage('public', 1, 20);

    expect(listClient.getPopularDefinitions).toHaveBeenCalledWith(2, 20);
    expect(result.results.map(list => list.slug)).toEqual(['dc']);
  });

  it('still returns the fixed lists when popular lists are unavailable', async () => {
    const { service, listClient } = setupTest();
    listClient.getPopularDefinitions = jest.fn().mockRejectedValue(new Error('down'));

    const result = await service.getListsPage('public', 0, 20);

    expect(result.results.map(list => list.slug)).toEqual(['trakt-movies-popular']);
    expect(result).toMatchObject({ totalItems: 1, totalPages: 1 });
  });
});
