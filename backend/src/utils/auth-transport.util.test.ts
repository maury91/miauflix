import { Hono } from 'hono';

import {
  readAccessToken,
  readRefreshToken,
  readRefreshTokenPairs,
  wantsTokenTransport,
} from './auth-transport.util';

const setupTest = () => {
  const app = new Hono();
  app.get('/', context =>
    context.json({
      transport: wantsTokenTransport(context),
      access: readAccessToken(context, '__at_s1') ?? null,
      refresh: readRefreshToken(context, '__rt_s1') ?? null,
      pairs: readRefreshTokenPairs(context),
    })
  );
  return { app };
};

const read = async (headers: Record<string, string>) => {
  const { app } = setupTest();
  return (await app.request('/', { headers })).json();
};

describe('auth transport', () => {
  it('reads nothing from a request without tokens', async () => {
    expect(await read({})).toEqual({ transport: false, access: null, refresh: null, pairs: [] });
  });

  it('reads the tokens from the session cookies', async () => {
    expect(await read({ Cookie: '__at_s1=cookie-access; __rt_s1=cookie-refresh' })).toMatchObject({
      access: 'cookie-access',
      refresh: 'cookie-refresh',
    });
  });

  it('falls back to the bearer and refresh headers', async () => {
    expect(
      await read({
        'X-Auth-Transport': 'token',
        Authorization: 'Bearer header-access',
        'X-Refresh-Token': 'header-refresh',
      })
    ).toMatchObject({ transport: true, access: 'header-access', refresh: 'header-refresh' });
  });

  it('prefers the cookies over the headers', async () => {
    expect(
      await read({
        Cookie: '__at_s1=cookie-access; __rt_s1=cookie-refresh',
        Authorization: 'Bearer header-access',
        'X-Refresh-Token': 'header-refresh',
      })
    ).toMatchObject({ access: 'cookie-access', refresh: 'cookie-refresh' });
  });

  it('ignores an Authorization header that is not a bearer token', async () => {
    expect(await read({ Authorization: 'Basic dXNlcjpwYXNz' })).toMatchObject({ access: null });
  });

  it('parses session:token pairs and drops malformed ones', async () => {
    expect(
      await read({ 'X-Refresh-Tokens': 's1:token-1, s2:token-2,broken,:no-session,s3:' })
    ).toMatchObject({
      pairs: [
        { session: 's1', token: 'token-1' },
        { session: 's2', token: 'token-2' },
      ],
    });
  });
});
