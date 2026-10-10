import { afterEach, describe, expect, it, jest } from 'bun:test';

import { ProviderError } from '../src/provider/provider';
import { TmdbClient } from '../src/provider/tmdb/client';
import { TmdbProvider } from '../src/provider/tmdb/tmdb.provider';
import type { ApiCache } from '../src/utils/api-cache';

const makeCache = (keys: string[]): ApiCache =>
  ({
    wrap: async <T>(key: string, _ttlMs: number, load: () => Promise<T>): Promise<T> => {
      keys.push(key);
      return load();
    },
  }) as ApiCache;

describe('TmdbClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('rejects a timed-out request as a provider error', async () => {
    jest.useFakeTimers();
    let requestStarted: (() => void) | undefined;
    const started = new Promise<void>(resolve => {
      requestStarted = resolve;
    });
    globalThis.fetch = (async (
      _input: Parameters<typeof fetch>[0],
      init: Parameters<typeof fetch>[1]
    ) => {
      if (!init?.signal) throw new Error('request must include an abort signal');
      requestStarted?.();
      return await new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation timed out', 'AbortError'))
        );
      });
    }) as unknown as typeof fetch;
    const client = new TmdbClient(makeCache([]), {
      apiUrl: 'https://tmdb.example/3',
      accessToken: 'token',
    });

    const request = client.test();
    await started;
    jest.advanceTimersByTime(60_000);

    await expect(request).rejects.toBeInstanceOf(ProviderError);
  });

  it('rejects a stalled response body as a provider error', async () => {
    jest.useFakeTimers();
    let requestStarted: (() => void) | undefined;
    const started = new Promise<void>(resolve => {
      requestStarted = resolve;
    });
    let responseBodyStarted: (() => void) | undefined;
    const bodyStarted = new Promise<void>(resolve => {
      responseBodyStarted = resolve;
    });
    let rejectBody: ((reason?: unknown) => void) | undefined;
    let signal: AbortSignal | undefined;
    globalThis.fetch = (async (
      _input: Parameters<typeof fetch>[0],
      init: Parameters<typeof fetch>[1]
    ) => {
      signal = init?.signal ?? undefined;
      requestStarted?.();
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: null,
        json: async () => {
          responseBodyStarted?.();
          return await new Promise<never>((_resolve, reject) => {
            rejectBody = reject;
            signal?.addEventListener('abort', () =>
              reject(new DOMException('The response body timed out', 'AbortError'))
            );
          });
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const client = new TmdbClient(makeCache([]), {
      apiUrl: 'https://tmdb.example/3',
      accessToken: 'token',
    });

    const request = client.test();
    void request.catch(() => undefined);
    await started;
    await bodyStarted;
    jest.advanceTimersByTime(60_000);

    try {
      expect(signal?.aborted).toBe(true);
      await expect(request).rejects.toBeInstanceOf(ProviderError);
    } finally {
      rejectBody?.(new DOMException('Test cleanup', 'AbortError'));
    }
  });

  it('shares concurrent configuration requests and clears the flight afterward', async () => {
    const cacheKeys: string[] = [];
    let requests = 0;
    globalThis.fetch = (async () => {
      requests++;
      return Response.json({ images: { secure_base_url: 'https://image.test/' } });
    }) as unknown as typeof fetch;
    const client = new TmdbClient(makeCache(cacheKeys), {
      apiUrl: 'https://tmdb.example/3',
      accessToken: 'token',
    });
    const configuration = () =>
      (client as unknown as { configuration(): Promise<unknown> }).configuration();

    await Promise.all([configuration(), configuration()]);
    expect(requests).toBe(1);
    expect(cacheKeys).toEqual(['tmdb:v1:configuration']);

    await configuration();
    expect(requests).toBe(2);
    expect(cacheKeys).toEqual(['tmdb:v1:configuration', 'tmdb:v1:configuration']);
  });

  it.each([true, false])('loads TV logo artwork when available: %s', async hasLogo => {
    const urls: string[] = [];
    const cacheKeys: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('/configuration'))
        return Response.json({ images: { secure_base_url: 'https://image.test/' } });
      return Response.json({
        id: 100,
        external_ids: { imdb_id: null },
        name: 'Arcane',
        overview: '',
        tagline: '',
        first_air_date: '2021-01-01',
        poster_path: '/poster.jpg',
        backdrop_path: '/backdrop.jpg',
        status: 'Ended',
        type: 'Scripted',
        in_production: false,
        episode_run_time: [],
        genres: [],
        popularity: 1,
        vote_average: 8,
        seasons: [],
        translations: { translations: [] },
        images: {
          logos: hasLogo
            ? [
                { file_path: '/neutral.png', iso_639_1: null },
                { file_path: '/arcane.png', iso_639_1: 'en' },
                { file_path: '/neutral.png', iso_639_1: null },
              ]
            : [],
        },
      });
    }) as unknown as typeof fetch;
    const client = new TmdbClient(makeCache(cacheKeys), {
      apiUrl: 'https://tmdb.example/3',
      accessToken: 'token',
    });
    const show = await client.getTVShowDetails(100);
    expect(show.logo).toBe(hasLogo ? 'https://image.test/original/arcane.png' : '');
    expect(show.logoCandidates?.map(candidate => candidate.url)).toEqual(
      hasLogo
        ? ['https://image.test/original/arcane.png', 'https://image.test/original/neutral.png']
        : []
    );
    expect(urls[0]).toContain('append_to_response=external_ids,translations,images');
    expect(urls[0]).toContain('include_image_language=en,null');
    expect(cacheKeys).toContain('tmdb:v1:tv:100:v3');
  });

  it('orders eligible movie logos by configured language then neutral and removes duplicate assets', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('/configuration'))
        return Response.json({ images: { secure_base_url: 'https://image.test/' } });
      return Response.json({
        id: 50,
        imdb_id: null,
        title: 'Film',
        overview: '',
        tagline: null,
        release_date: '2025-01-01',
        poster_path: null,
        backdrop_path: null,
        runtime: 100,
        genres: [],
        popularity: 1,
        vote_average: 7,
        images: {
          logos: [
            { file_path: '/neutral.png', iso_639_1: null },
            { file_path: '/french.png', iso_639_1: 'fr' },
            { file_path: '/french.png', iso_639_1: null },
            { file_path: '/spanish.png', iso_639_1: 'es' },
          ],
        },
        translations: { translations: [] },
      });
    }) as unknown as typeof fetch;
    const client = new TmdbClient(
      makeCache([]),
      {
        apiUrl: 'https://tmdb.example/3',
        accessToken: 'token',
      },
      'fr'
    );

    const movie = await client.getMovieDetails(50);

    expect(movie.logo).toBe('https://image.test/original/french.png');
    expect(movie.logoCandidates.map(candidate => candidate.url)).toEqual([
      'https://image.test/original/french.png',
      'https://image.test/original/neutral.png',
    ]);
    expect(urls.find(url => url.includes('/movie/50?'))).toContain(
      'include_image_language=fr,null'
    );
  });

  it('shares concurrent movie and TV genre requests', async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests++;
      return Response.json({ genres: [] });
    }) as unknown as typeof fetch;
    const client = new TmdbClient(makeCache([]), {
      apiUrl: 'https://tmdb.example/3',
      accessToken: 'token',
    });

    await Promise.all([
      client.movieGenres('en'),
      client.movieGenres('en'),
      client.tvGenres('en'),
      client.tvGenres('en'),
    ]);

    expect(requests).toBe(2);
  });
});

describe('TmdbProvider', () => {
  it('derives a stable image key and a detailed TMDB analysis source', () => {
    const provider = new TmdbProvider({} as unknown as TmdbClient);

    expect(
      provider.getBackdropAnalysisSource('https://image.tmdb.org/t/p/w1280/abc123.jpg')
    ).toEqual({
      key: '/abc123.jpg',
      url: 'https://image.tmdb.org/t/p/w780/abc123.jpg',
    });
    expect(
      provider.getBackdropAnalysisSource('https://untrusted.example/t/p/w1280/abc123.jpg')
    ).toBeNull();
  });

  it('returns a supplied TMDB identifier without an IMDb lookup', async () => {
    const findByImdbId = jest.fn();
    const provider = new TmdbProvider({ findByImdbId } as unknown as TmdbClient);

    await expect(
      provider.resolveExternal({ mediaType: 'movie', ids: { tmdb: 123 } })
    ).resolves.toBe(123);
    expect(findByImdbId).not.toHaveBeenCalled();
  });

  it('falls back to IMDb when no TMDB identifier is supplied', async () => {
    const findByImdbId = jest.fn().mockResolvedValue(456);
    const provider = new TmdbProvider({ findByImdbId } as unknown as TmdbClient);

    await expect(
      provider.resolveExternal({ mediaType: 'tv', ids: { imdb: 'tt1234567' } })
    ).resolves.toBe(456);
    expect(findByImdbId).toHaveBeenCalledWith('tt1234567', 'tv');
  });

  it('returns null when no external identifier is supplied', async () => {
    const provider = new TmdbProvider({} as unknown as TmdbClient);

    await expect(provider.resolveExternal({ mediaType: 'movie', ids: {} })).resolves.toBeNull();
  });

  it('collects season changes from every valid page', async () => {
    const pages = new Map([
      [
        1,
        {
          page: 1,
          total_pages: 2,
          changes: [{ key: 'season', items: [{ value: { season_number: 1 } }] }],
        },
      ],
      [
        2,
        {
          page: 2,
          total_pages: 2,
          changes: [{ key: 'season', items: [{ value: { season_number: 2 } }] }],
        },
      ],
    ]);
    const requestedPages: number[] = [];
    const provider = new TmdbProvider({
      tvShowChanges: async (_mediaId: number, page: number) => {
        requestedPages.push(page);
        return pages.get(page);
      },
    } as unknown as TmdbClient);

    await expect(provider.seasonChanges(100)).resolves.toEqual([1, 2]);
    expect(requestedPages).toEqual([1, 2]);
  });

  it('stops season change pagination when metadata is missing or inconsistent', async () => {
    const requestedPages: number[] = [];
    const provider = new TmdbProvider({
      tvShowChanges: async (_mediaId: number, page: number) => {
        requestedPages.push(page);
        return {
          page: 2,
          changes: [{ key: 'season', items: [{ value: { season_number: 1 } }] }],
        };
      },
    } as unknown as TmdbClient);

    await expect(provider.seasonChanges(100)).resolves.toEqual([1]);
    expect(requestedPages).toEqual([1]);
  });

  it('caps season change pagination', async () => {
    const requestedPages: number[] = [];
    const provider = new TmdbProvider({
      tvShowChanges: async (_mediaId: number, page: number) => {
        requestedPages.push(page);
        return {
          page,
          total_pages: Number.MAX_SAFE_INTEGER,
          changes: [],
        };
      },
    } as unknown as TmdbClient);

    await expect(provider.seasonChanges(100)).resolves.toEqual([]);
    expect(requestedPages).toHaveLength(100);
    expect(requestedPages.at(-1)).toBe(100);
  });
});
