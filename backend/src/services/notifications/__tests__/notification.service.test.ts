import { configureFakerSeed } from '@__test-utils__/utils';

import type { Database } from '@database/database';

import { NotificationService } from '../notification.service';

describe('NotificationService', () => {
  const setupTest = () => {
    const watchlists = {
      findLocalWatchlistOwners: jest.fn(),
    };
    const progress = {
      findUserIdsForMovie: jest.fn(),
      findUserIdsForShow: jest.fn(),
    };
    const query = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };
    const database = {
      getRepository: jest.fn().mockReturnValue(repository),
      getMediaListRepository: jest.fn().mockReturnValue(watchlists),
      getProgressRepository: jest.fn().mockReturnValue(progress),
      write: jest.fn((operation: () => Promise<unknown>) => operation()),
    } as unknown as Database;

    return {
      service: new NotificationService(database),
      watchlists,
      progress,
      query,
    };
  };

  beforeAll(() => {
    configureFakerSeed();
  });

  it('notifies the union of movie watchlist and viewing-history users once', async () => {
    const { service, watchlists, progress, query } = setupTest();
    watchlists.findLocalWatchlistOwners.mockResolvedValue(['watchlisted', 'both']);
    progress.findUserIdsForMovie.mockResolvedValue(['both', 'watched']);

    await service.movieQualityUpgrade({
      mediaId: 42,
      title: 'Example Film',
      qualityKey: 'web',
      previousQuality: 'CAM',
      nextQuality: 'WEB',
    });

    expect(query.values).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'watchlisted', dedupeKey: 'movie:42:web' }),
      expect.objectContaining({ userId: 'both', dedupeKey: 'movie:42:web' }),
      expect.objectContaining({ userId: 'watched', dedupeKey: 'movie:42:web' }),
    ]);
    expect(query.orIgnore).toHaveBeenCalled();
  });

  it('notifies current TV interests about new episodes without replaying old history', async () => {
    const { service, watchlists, progress, query } = setupTest();
    watchlists.findLocalWatchlistOwners.mockResolvedValue(['watchlisted']);
    progress.findUserIdsForShow.mockResolvedValue(['watchlisted', 'watched']);

    await service.episodeAvailable({
      showMediaId: 9001,
      showTitle: 'Example Show',
      seasonNumber: 1,
      episodeNumber: 8,
      airDate: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
    });

    expect(query.values).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: 'watchlisted',
        dedupeKey: 'tv:9001:1:8',
        message: 'S01E08 is ready to watch.',
      }),
      expect.objectContaining({
        userId: 'watched',
        dedupeKey: 'tv:9001:1:8',
        message: 'S01E08 is ready to watch.',
      }),
    ]);

    query.values.mockClear();
    await service.episodeAvailable({
      showMediaId: 9001,
      showTitle: 'Example Show',
      seasonNumber: 1,
      episodeNumber: 1,
      airDate: new Date(Date.now() - 46 * 24 * 60 * 60_000).toISOString(),
    });

    expect(query.values).not.toHaveBeenCalled();
  });
});
