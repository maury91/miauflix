import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const API = 'https://miauflix.example';
const tokens = { accessToken: 'access-1', refreshToken: 'refresh-1' };

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const setupTest = async () => {
  vi.resetModules();
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  const tvAuth = await import('./tv-auth');
  const sentHeaders = (call = -1) => new Headers(fetchMock.mock.calls.at(call)?.[1]?.headers);
  return { ...tvAuth, fetchMock, sentHeaders };
};

describe('tvAuthFetch', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('asks for token transport and never sends cookies', async () => {
    const { tvAuthFetch, fetchMock, sentHeaders } = await setupTest();
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'ok' }));

    await tvAuthFetch(`${API}/api/health`, { credentials: 'include' });

    expect(sentHeaders().get('X-Auth-Transport')).toBe('token');
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('omit');
  });

  it('keeps the tokens from a login and sends them on later requests', async () => {
    const { tvAuthFetch, getTvAccessToken, fetchMock, sentHeaders } = await setupTest();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { session: 's1', user: {}, tokens }));
    const login = await tvAuthFetch(`${API}/api/auth/login`, { method: 'POST' });
    // The caller can still read the body
    expect(await login.json()).toMatchObject({ session: 's1' });
    expect(getTvAccessToken('s1')).toBe('access-1');

    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await tvAuthFetch(`${API}/api/auth/session`, { headers: { 'X-Session-Id': 's1' } });
    expect(sentHeaders().get('Authorization')).toBe('Bearer access-1');

    await tvAuthFetch(`${API}/api/auth/sessions`);
    expect(sentHeaders().get('X-Refresh-Tokens')).toBe('s1:refresh-1');
  });

  it('refreshes with the stored refresh token and keeps the rotated tokens', async () => {
    const first = await setupTest();
    first.fetchMock.mockResolvedValue(jsonResponse(200, { session: 's1', user: {}, tokens }));
    await first.tvAuthFetch(`${API}/api/auth/login`, { method: 'POST' });

    // After a restart only the refresh token is left
    const { tvAuthFetch, getTvAccessToken, fetchMock, sentHeaders } = await setupTest();
    expect(getTvAccessToken('s1')).toBeUndefined();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        user: {},
        tokens: { accessToken: 'access-2', refreshToken: 'refresh-2' },
      })
    );

    await tvAuthFetch(`${API}/api/auth/refresh/s1`, { method: 'POST' });

    expect(sentHeaders().get('X-Refresh-Token')).toBe('refresh-1');
    expect(getTvAccessToken('s1')).toBe('access-2');
    await tvAuthFetch(`${API}/api/auth/refresh/s1`, { method: 'POST' });
    expect(sentHeaders().get('X-Refresh-Token')).toBe('refresh-2');
  });

  it.each([
    ['a rejected refresh', 'refresh', 401],
    ['a logout', 'logout', 200],
  ])('forgets the session after %s', async (_label, action, status) => {
    const { tvAuthFetch, getTvAccessToken, fetchMock, sentHeaders } = await setupTest();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { session: 's1', user: {}, tokens }));
    await tvAuthFetch(`${API}/api/auth/login`, { method: 'POST' });

    fetchMock.mockResolvedValue(jsonResponse(status, {}));
    await tvAuthFetch(`${API}/api/auth/${action}/s1`, { method: 'POST' });

    expect(getTvAccessToken('s1')).toBeUndefined();
    await tvAuthFetch(`${API}/api/auth/sessions`);
    expect(sentHeaders().get('X-Refresh-Tokens')).toBeNull();
  });

  it('forgets the sent sessions the backend did not list', async () => {
    const { tvAuthFetch, fetchMock, sentHeaders } = await setupTest();
    for (const session of ['s1', 's2']) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          session,
          user: {},
          tokens: { accessToken: `access-${session}`, refreshToken: `refresh-${session}` },
        })
      );
      await tvAuthFetch(`${API}/api/auth/login`, { method: 'POST' });
    }

    fetchMock.mockResolvedValue(jsonResponse(200, [{ session: 's2', user: {} }]));
    await tvAuthFetch(`${API}/api/auth/sessions`);
    expect(sentHeaders().get('X-Refresh-Tokens')).toBe('s1:refresh-s1,s2:refresh-s2');

    await tvAuthFetch(`${API}/api/auth/sessions`);
    expect(sentHeaders().get('X-Refresh-Tokens')).toBe('s2:refresh-s2');
  });

  it('keeps a session whose token was refreshed while it was being listed', async () => {
    const { tvAuthFetch, fetchMock, sentHeaders } = await setupTest();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { session: 's1', user: {}, tokens }));
    await tvAuthFetch(`${API}/api/auth/login`, { method: 'POST' });

    // The listing does not include s1, but a refresh rotates its token before the listing returns
    let answerListing!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>(resolve => (answerListing = resolve)));
    const listing = tvAuthFetch(`${API}/api/auth/sessions`);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        user: {},
        tokens: { accessToken: 'access-2', refreshToken: 'refresh-2' },
      })
    );
    await tvAuthFetch(`${API}/api/auth/refresh/s1`, { method: 'POST' });
    answerListing(jsonResponse(200, []));
    await listing;

    fetchMock.mockResolvedValue(jsonResponse(200, [{ session: 's1', user: {} }]));
    await tvAuthFetch(`${API}/api/auth/sessions`);
    expect(sentHeaders().get('X-Refresh-Tokens')).toBe('s1:refresh-2');
  });

  it('keeps the sessions when listing them fails', async () => {
    const { tvAuthFetch, fetchMock, sentHeaders } = await setupTest();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { session: 's1', user: {}, tokens }));
    await tvAuthFetch(`${API}/api/auth/login`, { method: 'POST' });

    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'Internal server error' }));
    await tvAuthFetch(`${API}/api/auth/sessions`);
    await tvAuthFetch(`${API}/api/auth/sessions`);
    expect(sentHeaders().get('X-Refresh-Tokens')).toBe('s1:refresh-1');
  });
});
