import { Hono } from 'hono';

import {
  createSecurityHeadersMiddleware,
  cspOrigins,
  inlineScriptHashes,
} from './security-headers.middleware';

describe('security headers', () => {
  it('hashes inline scripts and skips external ones', () => {
    const hashes = inlineScriptHashes(
      `<script>window.API_URL = '/';</script><script type="module" src="/assets/a.js"></script>`
    );
    expect(hashes).toEqual([
      `'sha256-${new Bun.CryptoHasher('sha256').update("window.API_URL = '/';").digest('base64')}'`,
    ]);
  });

  it('sets the CSP and the other security headers, but not HSTS or CORP', async () => {
    const app = new Hono()
      .use(createSecurityHeadersMiddleware(undefined))
      .get('/', c => c.text('ok'));
    const response = await app.request('/');
    const csp = response.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Referrer-Policy')).toBe('same-origin');
    expect(response.headers.get('Strict-Transport-Security')).toBeNull();
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBeNull();
  });

  it('allows extra artwork origins for images and fetches, and only plain origins', async () => {
    expect(
      cspOrigins([
        ' http://127.0.0.1:3001 ',
        'https://img.example/',
        'https://x.example/path',
        'https://a; script-src *',
        'ftp://f.example',
        '',
      ])
    ).toEqual(['http://127.0.0.1:3001', 'https://img.example']);

    const app = new Hono()
      .use(createSecurityHeadersMiddleware(undefined, ['http://127.0.0.1:3001']))
      .get('/', c => c.text('ok'));
    const csp = (await app.request('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toMatch(/img-src [^;]*https:\/\/image\.tmdb\.org http:\/\/127\.0\.0\.1:3001/);
    expect(csp).toMatch(/connect-src [^;]*http:\/\/127\.0\.0\.1:3001/);
  });
});
