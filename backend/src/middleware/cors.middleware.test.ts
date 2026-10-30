import { Hono } from 'hono';

import { createCorsMiddleware } from './cors.middleware';

const setupTest = (allowTvApp: boolean) => {
  const app = new Hono();
  app.use(createCorsMiddleware(['https://miauflix.example'], () => allowTvApp));
  app.get('/api/health', context => context.json({ status: 'ok' }));
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
    const { app } = setupTest(true);
    const response = await app.request('/api/health', {
      headers: { Origin: 'https://miauflix.example' },
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://miauflix.example');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it.each(['file://', 'null'])('allows the TV app origin %s without credentials', async origin => {
    const { app } = setupTest(true);
    const response = await preflight(app, origin);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Auth-Transport');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Refresh-Token');
  });

  it('rejects the TV app origin when ALLOW_TV_APP is off', async () => {
    const { app } = setupTest(false);
    const response = await preflight(app, 'file://');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('does not treat other origins as the TV app', async () => {
    const { app } = setupTest(true);
    const response = await preflight(app, 'https://evil.example');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
