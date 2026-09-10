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

  it('uses the requested language in the list query and cache key', async () => {
    const cacheKeys: string[] = [];
    const requestUrls: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      requestUrls.push(String(input));
      return Response.json({ page: 2, total_pages: 1, total_results: 0, results: [] });
    }) as unknown as typeof fetch;
    const client = new TmdbClient(makeCache(cacheKeys), {
      apiUrl: 'https://tmdb.example/3',
      accessToken: 'token',
    });

    await client.popularMovies(2, 'it');

    expect(cacheKeys).toEqual(['tmdb:v1:list:movies-popular:2:it']);
    expect(requestUrls).toEqual([
      'https://tmdb.example/3/discover/movie?include_adult=false&include_video=false&language=it&page=2&sort_by=popularity.desc&vote_count.gte=10',
    ]);
  });
});

describe('TmdbProvider', () => {
  it('returns the requested-language list summaries', async () => {
    const provider = new TmdbProvider({
      popularMovies: async (_page: number, language: string) => ({
        page: 1,
        totalPages: 1,
        totalItems: 1,
        items: [
          {
            id: 1,
            title: language === 'it' ? 'Italiano' : 'English',
            overview: '',
            poster_path: null,
            backdrop_path: null,
            genre_ids: [],
            release_date: '',
            popularity: 0,
            vote_average: 0,
          },
        ],
      }),
    } as unknown as TmdbClient);

    const page = await provider.getListPage('@@tmdb_movies_popular', 1, 'it');

    expect(page.items[0]?.title).toBe('Italiano');
  });
});
