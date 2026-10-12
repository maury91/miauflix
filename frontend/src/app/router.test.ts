import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getRouteSnapshot,
  navigate,
  navigateBack,
  parseRoute,
  routePath,
  subscribeRoute,
} from './router';

describe('application routes', () => {
  afterEach(() => {
    navigate({ type: 'home' }, { replace: true });
    vi.restoreAllMocks();
  });

  it.each([
    [{ type: 'home' }, '/'],
    [{ type: 'movieDetails', mediaId: 123 }, '/movies/123'],
    [{ type: 'showDetails', mediaId: 456 }, '/shows/456'],
    [{ type: 'moviePlayer', mediaId: 123 }, '/movies/123/watch'],
    [
      { type: 'episodePlayer', showMediaId: 456, seasonNumber: 0, episodeNumber: 2 },
      '/shows/456/seasons/0/episodes/2/watch',
    ],
    [{ type: 'settings' }, '/settings'],
    [{ type: 'configuration' }, '/settings/configuration'],
    [{ type: 'storage' }, '/settings/storage'],
    [{ type: 'qrApproval', approvalToken: 'approval token' }, '/auth/qr/approval%20token'],
  ] as const)('builds and parses %s', (route, path) => {
    expect(routePath(route)).toBe(path);
    expect(parseRoute(path)).toEqual(route);
  });

  it.each(['/movies/0', '/movies/1.2', '/shows/2/seasons/-1/episodes/1/watch', '/unknown'])(
    'rejects malformed or unknown path %s',
    path => {
      expect(parseRoute(path).type).toBe('notFound');
    }
  );

  it('uses browser history for player Back and falls back to details on direct entry', async () => {
    const unsubscribe = subscribeRoute(vi.fn());
    navigate({ type: 'movieDetails', mediaId: 123 }, { replace: true });
    navigate(
      { type: 'moviePlayer', mediaId: 123 },
      { parent: { type: 'movieDetails', mediaId: 123 } }
    );
    navigateBack({ type: 'movieDetails', mediaId: 123 });
    await vi.waitFor(() =>
      expect(getRouteSnapshot()).toEqual({ type: 'movieDetails', mediaId: 123 })
    );

    navigate({ type: 'moviePlayer', mediaId: 123 }, { replace: true });
    window.history.replaceState(null, '', '/movies/123/watch');
    navigateBack({ type: 'movieDetails', mediaId: 123 });
    expect(getRouteSnapshot()).toEqual({ type: 'movieDetails', mediaId: 123 });
    unsubscribe();
  });
});
