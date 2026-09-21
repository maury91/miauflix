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
});
