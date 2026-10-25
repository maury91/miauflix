import type { BatchResponse, SearchResponse } from '@miauflix/service-contracts';

import type { RecentSearchRepository } from '@repositories/recent-search.repository';

import { SearchService } from './search.service';

const page: SearchResponse = {
  page: 1,
  totalPages: 2,
  totalResults: 24,
  results: [
    {
      mediaType: 'movie',
      mediaId: 438631,
      title: 'Dune',
      overview: '',
      poster: 'poster.jpg',
      backdrop: 'backdrop.jpg',
      genreIds: [878],
      releaseDate: '2021-09-15',
      popularity: 90,
      rating: 7.8,
    },
    {
      mediaType: 'tv',
      mediaId: 90228,
      title: 'Dune: Prophecy',
      overview: '',
      poster: '',
      backdrop: '',
      genreIds: [],
      releaseDate: '2024-11-17',
      popularity: 40,
      rating: 7.8,
    },
  ],
};

const setupTest = () => {
  const catalog = {
    search: jest.fn().mockResolvedValue(page),
    discover: jest.fn().mockResolvedValue(page),
    batch: jest.fn(),
  };
  const recents = {
    list: jest
      .fn()
      .mockResolvedValue([
        { kind: 'query', query: 'Dune', searchedAt: new Date('2026-01-01T00:00:00Z') },
      ]),
    record: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const service = new SearchService(catalog, recents as unknown as RecentSearchRepository);
  return { service, catalog, recents };
};

describe('SearchService', () => {
  it('maps catalog search summaries to result cards', async () => {
    const { service, catalog } = setupTest();

    const result = await service.run({ query: 'Dune', page: 1, language: 'en' });

    expect(catalog.search).toHaveBeenCalledWith('Dune', 1, 'en');
    expect(result.totalResults).toBe(24);
    expect(result.results.map(item => [item._type, item.mediaId])).toEqual([
      ['movie', 438631],
      ['tvshow', 90228],
    ]);
  });

  it('uses discover for genre searches', async () => {
    const { service, catalog } = setupTest();

    await service.run({ genre: 'anime', page: 2, language: 'it' });

    expect(catalog.discover).toHaveBeenCalledWith('anime', 2, 'it');
    expect(catalog.search).not.toHaveBeenCalled();
  });

  it('enriches results with runtime and numbered season counts', async () => {
    const { service, catalog } = setupTest();
    const season = (seasonNumber: number) => ({ seasonNumber }) as never;
    catalog.batch.mockResolvedValue({
      items: [
        { mediaType: 'movie', mediaId: 438631, runtime: 155, logo: 'logo.png' },
        { mediaType: 'tv', mediaId: 90228, logo: '', seasons: [season(0), season(1)] },
      ],
      missing: [],
      errors: [],
    } as unknown as BatchResponse);
    const { results } = await service.run({ query: 'Dune', page: 1, language: 'en' });

    const details = await service.enrich(results, 'en');

    expect(catalog.batch).toHaveBeenCalledWith(
      [
        { mediaType: 'movie', mediaId: 438631 },
        { mediaType: 'tv', mediaId: 90228 },
      ],
      'en',
      'prefetch'
    );
    expect(details).toEqual([
      { _type: 'movie', mediaId: 438631, runtime: 155, logo: 'logo.png' },
      { _type: 'tvshow', mediaId: 90228, seasonCount: 1, logo: undefined },
    ]);
  });

  it('skips the catalog lookup when there is nothing to enrich', async () => {
    const { service, catalog } = setupTest();
    expect(await service.enrich([], 'en')).toEqual([]);
    expect(catalog.batch).not.toHaveBeenCalled();
  });

  it('serializes recent searches', async () => {
    const { service } = setupTest();
    expect(await service.listRecents('user')).toEqual([
      { kind: 'query', query: 'Dune', searchedAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });
});
