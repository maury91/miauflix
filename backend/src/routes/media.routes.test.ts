import { noRateLimit } from '@__test-utils__/routes';
import { Hono } from 'hono';

import { UserRole } from '@entities/user.entity';
import { handleError } from '@middleware/error-handler.middleware';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';
import type { ListService } from '@services/media/list.service';

import { createMediaRoutes } from './media.routes';

const movie = {
  localId: 11,
  mediaType: 'movie',
  mediaId: 101,
  imdbId: 'tt0000101',
  title: 'A movie',
  overview: 'Overview',
  tagline: null,
  poster: '/poster.jpg',
  backdrop: '/backdrop.jpg',
  backdropFocus: null,
  logo: null,
  heroLogo: null,
  artworkRevision: 1,
  cardLogoStatus: 'ready',
  heroLogoStatus: 'ready',
  genres: [{ id: 1, name: 'Drama' }],
  popularity: 10,
  rating: 7,
  releaseDate: '2020-01-01',
  runtime: 120,
};
const show = {
  localId: 22,
  mediaType: 'tv',
  mediaId: 202,
  imdbId: null,
  name: 'A show',
  overview: 'Overview',
  tagline: null,
  poster: '/poster.jpg',
  backdrop: '/backdrop.jpg',
  backdropFocus: { x: 0.5, y: 0.4 },
  logo: null,
  heroLogo: null,
  artworkRevision: 1,
  cardLogoStatus: 'ready',
  heroLogoStatus: 'ready',
  genres: [],
  popularity: 5,
  rating: 8,
  firstAirDate: '2019-01-01',
  episodeRunTime: [45],
  type: 'Scripted',
  inProduction: true,
};

const setupTest = (authenticated = true) => {
  const listService = { getMediaByRefs: jest.fn().mockResolvedValue([show, movie]) };
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (authenticated)
      c.set('sessionInfo', {
        sessionId: 'session-1',
        user: { id: 'user-1', email: 'user@example.com', role: UserRole.USER },
      });
    await next();
  });
  app.onError(handleError);
  app.route(
    '/media',
    createMediaRoutes({
      rateLimitGuard: noRateLimit,
      catalogClient: {} as CatalogClientService,
      listService: listService as unknown as ListService,
    })
  );
  const post = (body: unknown) =>
    app.request('/media/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  return { listService, post };
};

describe('media batch route', () => {
  it('returns card data for every title in one response, in the order given', async () => {
    const { listService, post } = setupTest();
    const items = [
      { mediaType: 'tv', mediaId: 202 },
      { mediaType: 'movie', mediaId: 101 },
    ];
    const response = await post({ items });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: unknown[] };
    expect(listService.getMediaByRefs).toHaveBeenCalledWith(items, 'en');
    expect(body.results).toEqual([
      expect.objectContaining({ _type: 'tvshow', id: 22, mediaId: 202, name: 'A show' }),
      expect.objectContaining({
        _type: 'movie',
        id: 11,
        mediaId: 101,
        title: 'A movie',
        genres: ['Drama'],
        runtime: 120,
      }),
    ]);
  });

  it('accepts as many titles as a catalog batch and rejects more', async () => {
    const { listService, post } = setupTest();
    const items = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ mediaType: 'movie', mediaId: index + 1 }));
    expect((await post({ items: items(50) })).status).toBe(200);
    expect((await post({ items: items(51) })).status).toBe(400);
    expect(listService.getMediaByRefs).toHaveBeenCalledTimes(1);
  });

  it.each([
    { items: [] },
    { items: [{ mediaType: 'person', mediaId: 1 }] },
    { items: [{ mediaType: 'movie', mediaId: -1 }] },
  ])('rejects invalid titles before reaching the catalog: %j', async body => {
    const { listService, post } = setupTest();
    expect((await post(body)).status).toBe(400);
    expect(listService.getMediaByRefs).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const { listService, post } = setupTest(false);
    const response = await post({ items: [{ mediaType: 'movie', mediaId: 101 }] });
    expect(response.status).toBe(401);
    expect(listService.getMediaByRefs).not.toHaveBeenCalled();
  });
});
