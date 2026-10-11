import { Hono } from 'hono';

import { UserRole } from '@entities/user.entity';
import { AuthError, RoleError } from '@errors/auth.errors';
import type { DownloadService } from '@services/download/download.service';
import type { StorageService } from '@services/storage/storage.service';

import { createStorageRoutes } from './storage.routes';

const setupTest = (role: UserRole | null = UserRole.ADMIN) => {
  const storage = {
    movieSourceId: 2,
    size: 100,
    allocatedBytes: 80,
    reservedBytes: 100,
    downloaded: 10_000,
    videoCompletedAt: new Date('2026-10-08T10:00:00Z'),
    activeStreams: 0,
    localOnly: false,
    location: '/private/downloads/movie',
    encryptedLayout: { video: { name: 'movie.mkv' } },
    movieSource: {
      quality: '1080p',
      hash: 'must-not-be-returned',
      movie: { title: 'Example Movie' },
    },
  };
  const storageService = {
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
  const downloadService = {
    getStorageActivity: jest.fn().mockReturnValue({
      activity: 'available_offline',
      seedEndsAt: null,
      videoComplete: true,
      torrentLoaded: true,
    }),
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
  app.onError((error, c) =>
    c.json(
      { error: error.message },
      error instanceof AuthError ? 401 : error instanceof RoleError ? 403 : 500
    )
  );
  app.route(
    '/storage',
    createStorageRoutes({
      storageService: storageService as unknown as StorageService,
      downloadService: downloadService as unknown as DownloadService,
      auditLogService: {} as never,
      configurationService: { get: () => undefined } as never,
    })
  );
  return { app, storageService, downloadService };
};

beforeAll(() => {
  process.env.RATE_LIMIT_TEST_MODE = 'true';
});

afterAll(() => {
  delete process.env.RATE_LIMIT_TEST_MODE;
});

describe('storage routes', () => {
  it('requires an administrator to list the storage inventory', async () => {
    const unauthenticated = setupTest(null);
    expect((await unauthenticated.app.request('/storage')).status).toBe(401);

    const user = setupTest(UserRole.USER);
    expect((await user.app.request('/storage')).status).toBe(403);
  });

  it('returns display-only inventory with activity and capacity details', async () => {
    const { app, storageService, downloadService } = setupTest();
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
          movieSourceId: 2,
          title: 'Example Movie',
          fileName: 'movie.mkv',
          quality: '1080p',
          physicalBytes: 80,
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
    expect(storageService.getInventory).toHaveBeenCalledTimes(1);
    expect(downloadService.getStorageActivity).toHaveBeenCalledWith(
      expect.objectContaining({ location: '/private/downloads/movie' })
    );
    expect(JSON.stringify(payload)).not.toContain('must-not-be-returned');
    expect(JSON.stringify(payload)).not.toContain('/private/downloads');
  });

  it('validates source IDs and maps safe removal outcomes', async () => {
    const { app, storageService } = setupTest();
    expect((await app.request('/storage/0', { method: 'DELETE' })).status).toBe(400);
    expect((await app.request('/storage/1.5', { method: 'DELETE' })).status).toBe(400);

    const response = await app.request('/storage/2', { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect(storageService.removeStorageWithResult).toHaveBeenCalledWith(2);

    storageService.removeStorageWithResult.mockResolvedValueOnce({ status: 'active_playback' });
    expect((await app.request('/storage/2', { method: 'DELETE' })).status).toBe(409);
    storageService.removeStorageWithResult.mockResolvedValueOnce({ status: 'cleanup_failed' });
    expect((await app.request('/storage/2', { method: 'DELETE' })).status).toBe(500);
    storageService.removeStorageWithResult.mockResolvedValueOnce({ status: 'removed', bytes: 0 });
    expect((await app.request('/storage/2', { method: 'DELETE' })).status).toBe(200);
  });
});
