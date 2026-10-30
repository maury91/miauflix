import { Hono } from 'hono';

import type { TvAppOriginSettings } from '@utils/origin.util';
import { isTvAppOrigin } from '@utils/origin.util';

import { createCorsMiddleware } from './cors.middleware';

const setupTest = (settings: TvAppOriginSettings = { allowTvApp: true }) => {
  const app = new Hono();
  app.use(
    createCorsMiddleware(['https://miauflix.example'], origin => isTvAppOrigin(origin, settings))
  );
  app.get('/api/health', context => context.json({ status: 'ok' }));
  // Like the converted-audio stream, which exposes its own timeline header
  app.get(
    '/api/stream',
    () =>
      new Response('', {
        headers: {
          'X-Playback-Timestamp-Offset': '1.5',
          'Access-Control-Expose-Headers': 'X-Playback-Timestamp-Offset',
        },
      })
  );
  return { app };
};

const preflight = (app: Hono, origin: string) =>
  app.request('/api/health', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'x-auth-transport,x-refresh-token',
    },
  });

describe('createCorsMiddleware', () => {
  it('allows configured browser origins with credentials', async () => {
    const { app } = setupTest();
    const response = await app.request('/api/health', {
      headers: { Origin: 'https://miauflix.example' },
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://miauflix.example');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it.each([
    ['file://', { allowTvApp: true }],
    ['null', { allowTvApp: true, allowNullOrigin: true }],
  ])('allows the TV app origin %s without credentials', async (origin, settings) => {
    const { app } = setupTest(settings);
    const response = await preflight(app, origin);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Auth-Transport');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Refresh-Token');
  });

  it('rejects the null origin without its opt-in', async () => {
    const { app } = setupTest();
    const response = await preflight(app, 'null');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('keeps the headers a route exposes for the TV app', async () => {
    const { app } = setupTest();
    const response = await app.request('/api/stream', { headers: { Origin: 'file://' } });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('file://');
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe(
      'X-Playback-Timestamp-Offset'
    );
  });

  it('rejects the TV app origin when ALLOW_TV_APP is off', async () => {
    const { app } = setupTest({ allowTvApp: false });
    const response = await preflight(app, 'file://');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('does not treat other origins as the TV app', async () => {
    const { app } = setupTest();
    const response = await preflight(app, 'https://evil.example');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
