import { configureFakerSeed } from '@__test-utils__/utils';
import { In } from 'typeorm';

import type { Database } from '@database/database';

import { MAX_PENDING_AVAILABILITY_REQUESTS, NotificationService } from '../notification.service';

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
      find: jest.fn().mockResolvedValue([]),
      exists: jest.fn().mockResolvedValue(false),
      count: jest.fn().mockResolvedValue(0),
      delete: jest.fn(),
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
      repository,
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

  it('tells everyone who asked once a movie gets a real source, then forgets the requests', async () => {
    const { service, query, repository } = setupTest();
    repository.find.mockResolvedValue([{ userId: 'alice' }, { userId: 'bob' }]);

    await service.playableAvailable({ kind: 'movie', mediaId: 1400940 }, 'Clayface');

    expect(query.values).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: 'alice',
        type: 'source_available',
        dedupeKey: 'available:m:1400940',
        message: 'Clayface is now available to watch.',
      }),
      expect.objectContaining({ userId: 'bob', dedupeKey: 'available:m:1400940' }),
    ]);
    // A request made while notifying is kept for the next check.
    expect(repository.delete).toHaveBeenCalledWith({
      playableKey: 'm:1400940',
      userId: In(['alice', 'bob']),
    });
  });

  it('sends nothing when nobody asked about the playable', async () => {
    const { service, query, repository } = setupTest();

    await service.playableAvailable(
      { kind: 'episode', showMediaId: 9001, seasonNumber: 1, episodeNumber: 8 },
      'Example Show'
    );

    expect(query.values).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('stores a "notify me" request once per user and playable', async () => {
    const { service, query } = setupTest();

    await service.requestAvailability('alice', {
      kind: 'episode',
      showMediaId: 9001,
      seasonNumber: 1,
      episodeNumber: 8,
    });

    expect(query.values).toHaveBeenCalledWith({ userId: 'alice', playableKey: 'e:9001:1:8' });
    expect(query.orIgnore).toHaveBeenCalled();
  });

  it('refuses a new request once the user has the maximum pending', async () => {
    const { service, query, repository } = setupTest();
    repository.count.mockResolvedValue(MAX_PENDING_AVAILABILITY_REQUESTS);

    await expect(service.requestAvailability('alice', { kind: 'movie', mediaId: 1 })).resolves.toBe(
      'limited'
    );
    expect(query.values).not.toHaveBeenCalled();
  });

  it('accepts asking again for a pending playable even at the maximum', async () => {
    const { service, query, repository } = setupTest();
    repository.count.mockResolvedValue(MAX_PENDING_AVAILABILITY_REQUESTS);
    repository.exists.mockResolvedValue(true);

    await expect(service.requestAvailability('alice', { kind: 'movie', mediaId: 1 })).resolves.toBe(
      'requested'
    );
    expect(query.values).not.toHaveBeenCalled();
  });
});
