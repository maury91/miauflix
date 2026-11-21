import { noRateLimit } from '@__test-utils__/routes';
import { Hono } from 'hono';

import { UserRole } from '@entities/user.entity';
import { handleError } from '@middleware/error-handler.middleware';
import type { ContentSourceRepository } from '@repositories/content-source.repository';
import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';
import { StorageInventoryService } from '@services/storage/storage-inventory.service';

import { createStorageRoutes } from './storage.routes';

const setupTest = (role: UserRole | null = UserRole.ADMIN) => {
  const storage = {
    sourceId: 2,
    allocatedBytes: 80,
    reservedBytes: 100,
    downloaded: 10_000,
    activeStreams: 0,
    requestedFiles: ['Movie (2020)/movie.mkv', 'Movie (2020)/movie.en.srt'],
    activity: 'available_offline',
    videoComplete: true,
    torrentLoaded: true,
    seedEndsAt: null,
    remuxBytes: 20,
  };
  const mediaLoadClient = {
    getInventory: jest.fn().mockResolvedValue({
      items: [storage],
      physicalBytes: 80,
      storageBudgetBytes: 1000,
      reservedBytes: 100,
      chargedBytes: 100,
      filesystem: null,
    }),
    removeStorageWithResult: jest.fn().mockResolvedValue({ status: 'removed', bytes: 80 }),
  };
  const contentSourceRepository = {
    findWithMedia: jest.fn().mockResolvedValue([
      {
        id: 2,
        quality: '1080p',
        hash: 'must-not-be-returned',
        movies: [
          {
            movie: {
              title: 'Example Movie',
              releaseDate: '2020-05-01',
              backdrop: '/movie-backdrop.jpg',
              poster: '/movie-poster.jpg',
            },
          },
        ],
      },
    ]),
  };
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (role) {
      c.set('sessionInfo', {
        sessionId: 'session-1',
        user: { id: 'user-1', email: 'admin@example.com', role },
      });
    }
    await next();
  });
  app.onError(handleError);
  app.route(
    '/storage',
    createStorageRoutes({
      rateLimitGuard: noRateLimit,
      storageInventoryService: new StorageInventoryService({
        mediaLoadClient: mediaLoadClient as unknown as MediaLoadClientService,
        contentSources: contentSourceRepository as unknown as ContentSourceRepository,
      }),
    })
  );
  return { app, mediaLoadClient, contentSourceRepository };
};

describe('storage routes', () => {
  it('requires an administrator to list the storage inventory', async () => {
    const unauthenticated = setupTest(null);
    expect((await unauthenticated.app.request('/storage')).status).toBe(401);

    const user = setupTest(UserRole.USER);
    expect((await user.app.request('/storage')).status).toBe(403);
  });

  it('returns display-only inventory with activity and capacity details', async () => {
    const { app, mediaLoadClient, contentSourceRepository } = setupTest();
    const response = await app.request('/storage');

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      summary: {
        physicalBytes: 80,
        storageBudgetBytes: 1000,
        reservedBytes: 100,
        chargedBytes: 100,
        filesystem: null,
      },
      items: [
        {
          sourceId: 2,
          kind: 'movie',
          title: 'Example Movie',
          subtitle: '2020',
          image: '/movie-backdrop.jpg',
          fileName: 'movie.mkv',
          quality: '1080p',
          physicalBytes: 80,
          remuxBytes: 20,
          reservedBytes: 100,
          progressPercent: 100,
          videoComplete: true,
          activity: 'available_offline',
          torrentLoaded: true,
          activeStreams: 0,
          seedEndsAt: null,
        },
      ],
    });
    expect(mediaLoadClient.getInventory).toHaveBeenCalledTimes(1);
    expect(contentSourceRepository.findWithMedia).toHaveBeenCalledWith([2]);
    expect(JSON.stringify(payload)).not.toContain('must-not-be-returned');
  });

  it('tells episodes, anime and unmatched downloads apart', async () => {
    const { app, mediaLoadClient, contentSourceRepository } = setupTest();
    const item = (sourceId: number, allocatedBytes: number) => ({
      sourceId,
      allocatedBytes,
      reservedBytes: 0,
      downloaded: 5_000,
      activeStreams: 0,
      requestedFiles: [],
      activity: 'active',
      videoComplete: false,
      torrentLoaded: true,
      seedEndsAt: null,
    });
    mediaLoadClient.getInventory.mockResolvedValueOnce({
      items: [item(3, 30), item(4, 20), item(5, 10)],
      physicalBytes: 60,
      storageBudgetBytes: 1000,
      reservedBytes: 0,
      chargedBytes: 60,
      filesystem: null,
    });
    const show = (name: string, seasonLayoutVersion: string | null) => ({
      name,
      backdrop: `/${name}.jpg`,
      poster: null,
      seasonLayoutVersion,
    });
    const episode = (
      tvShow: ReturnType<typeof show>,
      seasonNumber: number,
      episodeNumber: number
    ) => ({
      episode: {
        name: `Episode ${episodeNumber}`,
        episodeNumber,
        stillPath: '/still.jpg',
        season: { seasonNumber, tvShow },
      },
    });
    const drama = show('Drama', null);
    const anime = show('Anime', 'anilist-1');
    contentSourceRepository.findWithMedia.mockResolvedValueOnce([
      { id: 3, quality: null, movies: [], episodes: [episode(drama, 1, 2)] },
      {
        id: 4,
        quality: null,
        movies: [],
        episodes: [episode(anime, 2, 2), episode(anime, 2, 1)],
      },
    ]);
    const payload = (await (await app.request('/storage')).json()) as {
      items: Record<string, unknown>[];
    };
    expect(
      payload.items.map(({ kind, title, subtitle, image }: Record<string, unknown>) => ({
        kind,
        title,
        subtitle,
        image,
      }))
    ).toEqual([
      { kind: 'episode', title: 'Drama', subtitle: 'S01E02 · Episode 2', image: '/Drama.jpg' },
      { kind: 'anime', title: 'Anime', subtitle: 'Season 2 · 2 episodes', image: '/Anime.jpg' },
      { kind: 'unknown', title: 'Download 5', subtitle: null, image: null },
    ]);
    expect(payload.items[0].remuxBytes).toBe(0);
  });

  it('validates source IDs and maps safe removal outcomes', async () => {
    const { app, mediaLoadClient } = setupTest();
    expect((await app.request('/storage/0', { method: 'DELETE' })).status).toBe(400);
    expect((await app.request('/storage/1.5', { method: 'DELETE' })).status).toBe(400);

    const response = await app.request('/storage/2', { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect(mediaLoadClient.removeStorageWithResult).toHaveBeenCalledWith(2);

    mediaLoadClient.removeStorageWithResult.mockResolvedValueOnce({ status: 'active_playback' });
    expect((await app.request('/storage/2', { method: 'DELETE' })).status).toBe(409);
    mediaLoadClient.removeStorageWithResult.mockResolvedValueOnce({ status: 'cleanup_failed' });
    expect((await app.request('/storage/2', { method: 'DELETE' })).status).toBe(500);
    mediaLoadClient.removeStorageWithResult.mockResolvedValueOnce({ status: 'removed', bytes: 0 });
    expect((await app.request('/storage/2', { method: 'DELETE' })).status).toBe(200);
  });
});
