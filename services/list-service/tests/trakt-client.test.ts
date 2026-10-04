import { afterEach, describe, expect, it } from 'bun:test';

import { TraktClient, TraktProviderError } from '../src/trakt-client';

describe('TraktClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('bounds stalled requests and exposes a provider error', async () => {
    globalThis.fetch = (async (
      _input: Parameters<typeof fetch>[0],
      init: Parameters<typeof fetch>[1]
    ) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation timed out', 'AbortError'))
        );
      })) as unknown as typeof fetch;

    const request = new TraktClient(
      'client',
      'secret',
      'https://trakt.example',
      'https://app.example/trakt/callback',
      5
    ).test();

    try {
      await request;
      throw new Error('expected request to time out');
    } catch (error) {
      expect(error).toBeInstanceOf(TraktProviderError);
      expect((error as TraktProviderError).status).toBe(504);
    }
  });

  it('preserves upstream HTTP status errors', async () => {
    globalThis.fetch = (async () =>
      new Response('unauthorized', { status: 401 })) as unknown as typeof fetch;

    try {
      await new TraktClient(
        'client',
        'secret',
        'https://trakt.example',
        'https://app.example/trakt/callback'
      ).test();
      throw new Error('expected HTTP error');
    } catch (error) {
      expect(error).toBeInstanceOf(TraktProviderError);
      expect((error as TraktProviderError).status).toBe(401);
    }
  });

  it('sends the configured redirect URI when refreshing a token', async () => {
    let requestBody: Record<string, string> | undefined;
    globalThis.fetch = (async (
      _input: Parameters<typeof fetch>[0],
      init: Parameters<typeof fetch>[1]
    ) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, string>;
      return Response.json({
        access_token: 'access',
        refresh_token: 'refresh-2',
        expires_in: 3600,
      });
    }) as unknown as typeof fetch;

    await new TraktClient(
      'client',
      'secret',
      'https://trakt.example',
      'https://app.example/trakt/callback'
    ).refreshToken('refresh-1');

    expect(requestBody).toMatchObject({
      refresh_token: 'refresh-1',
      client_id: 'client',
      client_secret: 'secret',
      redirect_uri: 'https://app.example/trakt/callback',
      grant_type: 'refresh_token',
    });
  });

  it('bounds a stalled response body', async () => {
    globalThis.fetch = (async (
      _input: Parameters<typeof fetch>[0],
      init: Parameters<typeof fetch>[1]
    ) =>
      new Promise<Response>(resolve => {
        resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () =>
            new Promise<never>((_resolve, reject) =>
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('The operation timed out', 'AbortError'))
              )
            ),
        } as unknown as Response);
      })) as unknown as typeof fetch;

    try {
      await new TraktClient(
        'client',
        'secret',
        'https://trakt.example',
        'https://app.example/trakt/callback',
        5
      ).test();
      throw new Error('expected body to time out');
    } catch (error) {
      expect(error).toBeInstanceOf(TraktProviderError);
      expect((error as TraktProviderError).status).toBe(504);
    }
  });

  it('rejects malformed OAuth and profile responses', async () => {
    globalThis.fetch = (async () => Response.json({ device_code: 'device' })) as typeof fetch;

    await expect(
      new TraktClient(
        'client',
        'secret',
        'https://trakt.example',
        'https://app.example/trakt/callback'
      ).deviceCode()
    ).rejects.toMatchObject({
      message: 'Trakt API returned an invalid response',
      status: 502,
    });

    globalThis.fetch = (async () => Response.json({ access_token: 'access' })) as typeof fetch;

    await expect(
      new TraktClient(
        'client',
        'secret',
        'https://trakt.example',
        'https://app.example/trakt/callback'
      ).deviceToken('device-code')
    ).rejects.toMatchObject({
      message: 'Trakt API returned an invalid response',
      status: 502,
    });

    globalThis.fetch = (async () =>
      Response.json({ username: 'miauflix', ids: {} })) as typeof fetch;

    await expect(
      new TraktClient(
        'client',
        'secret',
        'https://trakt.example',
        'https://app.example/trakt/callback'
      ).profile('access-token')
    ).rejects.toMatchObject({
      message: 'Trakt API returned an invalid response',
      status: 502,
    });
  });

  it('rejects malformed paginated responses and pagination headers', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: {
          'X-Pagination-Page-Count': '1',
          'X-Pagination-Item-Count': '0',
        },
      })) as typeof fetch;

    await expect(
      new TraktClient(
        'client',
        'secret',
        'https://trakt.example',
        'https://app.example/trakt/callback'
      ).page('/movies/popular')
    ).rejects.toMatchObject({
      message: 'Trakt API returned an invalid page',
      status: 502,
    });

    globalThis.fetch = (async () =>
      new Response(JSON.stringify([]), { status: 200 })) as typeof fetch;

    await expect(
      new TraktClient(
        'client',
        'secret',
        'https://trakt.example',
        'https://app.example/trakt/callback'
      ).page('/movies/popular')
    ).rejects.toMatchObject({
      message: 'Trakt API returned an invalid X-Pagination-Page-Count header',
      status: 502,
    });
  });

  it('parses paginated popular community lists', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify([
          {
            list: {
              name: 'Best science fiction',
              description: 'A public list',
              item_count: 2,
              user: { ids: { slug: 'example-user' } },
              ids: { trakt: 42, slug: 'best-science-fiction' },
            },
          },
        ]),
        {
          status: 200,
          headers: {
            'X-Pagination-Page-Count': '3',
            'X-Pagination-Item-Count': '41',
          },
        }
      )) as typeof fetch;

    await expect(
      new TraktClient(
        'client',
        'secret',
        'https://trakt.example',
        'https://app.example/trakt/callback'
      ).popularLists(1, 20)
    ).resolves.toMatchObject({
      totalPages: 3,
      totalItems: 41,
      items: [{ list: { ids: { trakt: 42 } } }],
    });
  });

  it('accepts an empty provider list with zero pages', async () => {
    globalThis.fetch = (async () =>
      Response.json([], {
        headers: {
          'X-Pagination-Page-Count': '0',
          'X-Pagination-Item-Count': '0',
        },
      })) as typeof fetch;
    const client = new TraktClient(
      'client',
      'secret',
      'https://trakt.example',
      'https://app.example'
    );
    expect(await client.page('/sync/watchlist/movies', 'token')).toEqual({
      items: [],
      totalPages: 0,
      totalItems: 0,
    });
  });

  it('imports paused movies and episodes with usable identities and runtime', async () => {
    globalThis.fetch = (async (url, init) => {
      expect(String(url)).toContain('/sync/playback?extended=full');
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer token');
      return Response.json([
        {
          type: 'movie',
          progress: 25,
          paused_at: '2026-10-04T10:00:00Z',
          movie: { ids: { tmdb: 123 }, runtime: 100 },
        },
        {
          type: 'episode',
          progress: 50,
          paused_at: '2026-10-04T11:00:00Z',
          show: { ids: { tmdb: 42 }, runtime: 60 },
          episode: { season: 0, number: 2, runtime: 40 },
        },
        {
          type: 'movie',
          progress: 25,
          paused_at: '2026-10-04T10:00:00Z',
          movie: { ids: { tmdb: null }, runtime: 100 },
        },
      ]);
    }) as typeof fetch;
    const client = new TraktClient(
      'client',
      'secret',
      'https://trakt.example',
      'https://app.example'
    );
    expect(await client.playback('token')).toEqual([
      {
        playable: { kind: 'movie', mediaId: 123 },
        state: 'paused',
        durationSeconds: 6000,
        positionSeconds: 1500,
        updatedAt: '2026-10-04T10:00:00Z',
      },
      {
        playable: { kind: 'episode', showMediaId: 42, seasonNumber: 0, episodeNumber: 2 },
        state: 'paused',
        durationSeconds: 2400,
        positionSeconds: 1200,
        updatedAt: '2026-10-04T11:00:00Z',
      },
    ]);
  });

  it('rejects invalid provider playback percentages', async () => {
    globalThis.fetch = (async () =>
      Response.json([
        {
          type: 'movie',
          progress: 120,
          paused_at: '2026-10-04T10:00:00Z',
          movie: { ids: { tmdb: 123 }, runtime: 100 },
        },
      ])) as typeof fetch;
    const client = new TraktClient(
      'client',
      'secret',
      'https://trakt.example',
      'https://app.example'
    );
    await expect(client.playback('token')).rejects.toMatchObject({ status: 502 });
  });

  it('imports every playback page', async () => {
    const pages: number[] = [];
    globalThis.fetch = (async url => {
      const page = Number(new URL(String(url)).searchParams.get('page'));
      pages.push(page);
      return Response.json(
        [
          {
            type: 'movie',
            progress: 25,
            paused_at: '2026-10-04T10:00:00Z',
            movie: { ids: { tmdb: page }, runtime: 100 },
          },
        ],
        {
          headers: { 'X-Pagination-Page-Count': '2' },
        }
      );
    }) as typeof fetch;
    const client = new TraktClient(
      'client',
      'secret',
      'https://trakt.example',
      'https://app.example'
    );
    expect((await client.playback('token')).length).toBe(2);
    expect(pages).toEqual([1, 2]);
  });

  it('sends percentage scrobbles and avoids adding completion history twice', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return String(url).endsWith('/stop')
        ? new Response('already watched', { status: 409 })
        : Response.json({ action: 'pause' });
    }) as typeof fetch;
    const client = new TraktClient(
      'client',
      'secret',
      'https://trakt.example',
      'https://app.example'
    );
    const movie = {
      playable: { kind: 'movie' as const, mediaId: 123 },
      durationSeconds: 100,
      positionSeconds: 30,
      state: 'playing' as const,
    };
    await client.scrobble(movie, 'token');
    await client.scrobble(
      {
        ...movie,
        state: 'paused',
        playable: { kind: 'episode', showMediaId: 42, seasonNumber: 1, episodeNumber: 2 },
      },
      'token'
    );
    await client.scrobble({ ...movie, state: 'completed' }, 'token');
    expect(requests).toEqual([
      {
        url: 'https://trakt.example/scrobble/start',
        body: { movie: { ids: { tmdb: 123 } }, progress: 30 },
      },
      {
        url: 'https://trakt.example/scrobble/pause',
        body: { show: { ids: { tmdb: 42 } }, episode: { season: 1, number: 2 }, progress: 30 },
      },
      {
        url: 'https://trakt.example/scrobble/stop',
        body: { movie: { ids: { tmdb: 123 } }, progress: 100 },
      },
    ]);
  });

  it('imports paginated completion timestamps and filters incremental history by date', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async url => {
      urls.push(String(url));
      const page = Number(new URL(String(url)).searchParams.get('page'));
      return Response.json(
        page === 1
          ? [{ type: 'movie', watched_at: '2026-10-04T10:00:00Z', movie: { ids: { tmdb: 123 } } }]
          : [
              {
                type: 'episode',
                watched_at: '2026-10-04T11:00:00Z',
                show: { ids: { tmdb: 42 } },
                episode: { season: 1, number: 2 },
              },
            ],
        {
          headers: { 'X-Pagination-Page-Count': '2', 'X-Pagination-Item-Count': '2' },
        }
      );
    }) as typeof fetch;
    const client = new TraktClient(
      'client',
      'secret',
      'https://trakt.example',
      'https://app.example'
    );
    const entries = await client.watchedHistory('token', '2026-10-03T10:00:00Z');
    expect(entries.map(entry => entry.state)).toEqual(['completed', 'completed']);
    expect(entries[1].playable).toEqual({
      kind: 'episode',
      showMediaId: 42,
      seasonNumber: 1,
      episodeNumber: 2,
    });
    expect(urls.map(url => new URL(url).searchParams.get('start_at'))).toEqual([
      '2026-10-03T10:00:00Z',
      '2026-10-03T10:00:00Z',
    ]);
  });

  it('uses Trakt next unwatched episodes and excludes hidden or caught-up shows', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async url => {
      const path = new URL(String(url)).pathname;
      urls.push(path);
      if (path === '/users/hidden/progress_watched')
        return Response.json([{ show: { ids: { trakt: 2 } } }], {
          headers: { 'X-Pagination-Page-Count': '1', 'X-Pagination-Item-Count': '1' },
        });
      if (path === '/sync/watched/shows')
        return Response.json([
          { show: { ids: { trakt: 1, tmdb: 42 } } },
          { show: { ids: { trakt: 2, tmdb: 43 } } },
          { show: { ids: { trakt: 3, tmdb: 44 } } },
        ]);
      return Response.json({
        last_watched_at: '2026-10-04T10:00:00Z',
        next_episode: path.includes('/1/') ? { season: 2, number: 3, runtime: 40 } : null,
      });
    }) as typeof fetch;
    const client = new TraktClient(
      'client',
      'secret',
      'https://trakt.example',
      'https://app.example'
    );
    expect(await client.nextEpisodes('token')).toEqual([
      {
        playable: { kind: 'episode', showMediaId: 42, seasonNumber: 2, episodeNumber: 3 },
        state: 'paused',
        nextEpisode: true,
        positionSeconds: 0,
        durationSeconds: 2400,
        updatedAt: '2026-10-04T10:00:00Z',
      },
    ]);
    expect(urls).not.toContain('/shows/2/progress/watched');
  });

  it('uses stop for a late pause because Trakt rejects pauses above its completion threshold', async () => {
    let action: string | undefined;
    let percent: number | undefined;
    globalThis.fetch = (async (url, init) => {
      action = new URL(String(url)).pathname;
      percent = JSON.parse(String(init?.body)).progress;
      return Response.json({ action: 'scrobble' });
    }) as typeof fetch;
    const client = new TraktClient(
      'client',
      'secret',
      'https://trakt.example',
      'https://app.example'
    );
    await client.scrobble(
      {
        playable: { kind: 'movie', mediaId: 123 },
        state: 'paused',
        positionSeconds: 98,
        durationSeconds: 100,
      },
      'token'
    );
    expect(action).toBe('/scrobble/stop');
    expect(percent).toBe(98);
  });
});
