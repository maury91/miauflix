import { noRateLimit } from '@__test-utils__/routes';
import { ContractError } from '@miauflix/contract';
import { Hono } from 'hono';

import { handleError } from '@middleware/error-handler.middleware';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';

import { createArtworkRoutes } from './artwork.routes';

const image = (status = 200) =>
  new Response(status === 200 ? Uint8Array.from([1, 2, 3]) : null, {
    status,
    headers:
      status === 200
        ? { 'content-type': 'image/jpeg', 'x-artwork-revision': '4', etag: '"tag"' }
        : {},
  });

const setupTest = (cardImage = jest.fn().mockResolvedValue(image())) => {
  const app = new Hono();
  app.onError(handleError);
  app.route(
    '/artwork',
    createArtworkRoutes({
      rateLimitGuard: noRateLimit,
      catalogClient: { cardImage } as unknown as CatalogClientService,
    } as never)
  );
  return { app, cardImage };
};

describe('artwork routes', () => {
  it('serves a card image without authentication, kept forever at its revision', async () => {
    const { app, cardImage } = setupTest();
    const response = await app.request('/artwork/card/tv/42/sm.webp?rev=4');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(cardImage).toHaveBeenCalledWith('tv', 42, 'sm', 'webp');
  });

  it('keeps an unversioned or outdated URL only briefly', async () => {
    const { app, cardImage } = setupTest();
    cardImage.mockImplementation(async () => image());
    for (const url of ['/artwork/card/movie/7/lg.jpg', '/artwork/card/movie/7/lg.jpg?rev=3']) {
      const response = await app.request(url);
      expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    }
    expect(cardImage).toHaveBeenLastCalledWith('movie', 7, 'lg', 'jpeg');
  });

  it('rejects unknown sizes, formats and media types', async () => {
    const { app, cardImage } = setupTest();
    for (const url of [
      '/artwork/card/movie/7/xl.jpg',
      '/artwork/card/movie/7/sm.png',
      '/artwork/card/person/7/sm.jpg',
      '/artwork/card/movie/abc/sm.jpg',
      '/artwork/card/movie/7/sm.jpg?rev=x',
    ])
      expect((await app.request(url)).status).toBe(400);
    expect(cardImage).not.toHaveBeenCalled();
  });

  it('answers 404 for unknown titles, 503 without card images and 502 when one cannot be drawn', async () => {
    const missing = setupTest(jest.fn().mockResolvedValue(image(404)));
    expect((await missing.app.request('/artwork/card/movie/7/sm.jpg')).status).toBe(404);
    const thrown = setupTest(jest.fn().mockRejectedValue(new ContractError('not_found', 'gone')));
    expect((await thrown.app.request('/artwork/card/movie/7/sm.jpg')).status).toBe(404);
    const older = setupTest(jest.fn().mockRejectedValue(new ContractError('unsupported', 'old')));
    expect((await older.app.request('/artwork/card/movie/7/sm.jpg')).status).toBe(503);
    const failed = setupTest(jest.fn().mockResolvedValue(image(500)));
    expect((await failed.app.request('/artwork/card/movie/7/sm.jpg')).status).toBe(502);
    const slow = setupTest(
      jest.fn().mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))
    );
    expect((await slow.app.request('/artwork/card/movie/7/sm.jpg')).status).toBe(504);
  });

  it('keeps a card image without a revision (one drawing its name) only briefly', async () => {
    const { app } = setupTest(
      jest
        .fn()
        .mockResolvedValue(
          new Response(Uint8Array.from([1]), { headers: { 'content-type': 'image/jpeg' } })
        )
    );
    const response = await app.request('/artwork/card/movie/7/sm.jpg?rev=4');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
  });
});
