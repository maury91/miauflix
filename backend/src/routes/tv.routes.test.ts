jest.mock('@middleware/rate-limit.middleware', () => ({
  createRateLimitMiddlewareFactory:
    () => () => async (_context: unknown, next: () => Promise<void>) =>
      next(),
}));
jest.mock('@middleware/auth.middleware', () => ({
  authGuard: () => async (_context: unknown, next: () => Promise<void>) => next(),
}));

import { createTvRoutes } from './tv.routes';

const setupTest = (settings: Record<string, unknown> = {}) => {
  const config: Record<string, unknown> = {
    TV_PAIRING_ENABLED: true,
    TV_PAIRING_URL: 'https://pair.test/',
    ...settings,
  };
  const app = createTvRoutes({
    auditLogService: {},
    configurationService: { get: (key: string) => config[key] },
  } as never);
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  const pair = (code: string, url = 'http://192.168.1.10:3000/') =>
    app.request(`/pairings/${code}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  return { app, fetchMock, pair };
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('tv routes', () => {
  it('tells whether pairing is on', async () => {
    const { app } = setupTest({ TV_PAIRING_ENABLED: false });

    const response = await app.request('/pairing');
    expect(await response.json()).toEqual({ enabled: false });
  });

  it('stores the address under the code at the pairing service', async () => {
    const { fetchMock, pair } = setupTest();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await pair('ABCD EFGH');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ paired: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://pair.test/v1/pairings/ABCD%20EFGH');
    expect(init).toMatchObject({ method: 'PUT', body: '{"url":"http://192.168.1.10:3000"}' });
  });

  it('passes on an unknown code', async () => {
    const { fetchMock, pair } = setupTest();
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));

    const response = await pair('ABCDEFGH');
    expect(response.status).toBe(404);
  });

  it('reports an unreachable pairing service', async () => {
    const { fetchMock, pair } = setupTest();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    expect((await pair('ABCDEFGH')).status).toBe(502);
  });

  it('sends nothing while pairing is off', async () => {
    const { fetchMock, pair } = setupTest({ TV_PAIRING_ENABLED: false });

    expect((await pair('ABCDEFGH')).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects addresses with a path', async () => {
    const { fetchMock, pair } = setupTest();

    expect((await pair('ABCDEFGH', 'http://192.168.1.10:3000/app')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
