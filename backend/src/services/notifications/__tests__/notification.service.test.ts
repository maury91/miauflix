import { configureFakerSeed } from '@__test-utils__/utils';
import { Quality, Source } from '@miauflix/source-metadata-extractor';
import { In, IsNull, LessThan, Not } from 'typeorm';

import type { Database } from '@database/database';
import { Movie } from '@entities/movie.entity';
import { TVShow } from '@entities/tvshow.entity';

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
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const movies = { find: jest.fn().mockResolvedValue([]) };
    const shows = { find: jest.fn().mockResolvedValue([]) };
    const database = {
      getRepository: jest.fn((entity: unknown) =>
        entity === Movie ? movies : entity === TVShow ? shows : repository
      ),
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
      movies,
      shows,
    };
  };

  const row = (id: number, overrides: Record<string, unknown> = {}) => ({
    id,
    userId: 'alice',
    type: 'source_available',
    mediaType: 'movie',
    mediaId: 100 + id,
    title: `Title ${id}`,
    message: 'available',
    seasonNumber: null,
    episodeNumber: null,
    quality: null,
    sourceType: null,
    previousSourceType: null,
    readAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  });

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

  it('pages unread notifications newest first with a cursor', async () => {
    const { service, repository } = setupTest();
    repository.find.mockResolvedValue([row(9), row(8), row(7)]);

    const page = await service.list('alice', { status: 'unread', limit: 2 });

    expect(repository.find).toHaveBeenCalledWith({
      where: { userId: 'alice', readAt: IsNull() },
      order: { id: 'DESC' },
      take: 3,
    });
    expect(page.notifications.map(notification => notification.id)).toEqual([9, 8]);
    expect(page.nextCursor).toBe(8);
  });

  it('continues the read stream after the cursor and ends it on the last page', async () => {
    const { service, repository } = setupTest();
    repository.find.mockResolvedValue([row(3, { readAt: new Date() })]);

    const page = await service.list('alice', { status: 'read', cursor: 4, limit: 2 });

    expect(repository.find).toHaveBeenCalledWith({
      where: { userId: 'alice', readAt: Not(IsNull()), id: LessThan(4) },
      order: { id: 'DESC' },
      take: 3,
    });
    expect(page.nextCursor).toBeNull();
  });

  it('adds movie and show posters, and quality, to listed notifications', async () => {
    const { service, repository, movies, shows } = setupTest();
    repository.find.mockResolvedValue([
      row(3, { mediaId: 7, quality: 'FHD', sourceType: 'BLURAY' }),
      row(2, { mediaType: 'tv', mediaId: 9, seasonNumber: 1, episodeNumber: 2 }),
      row(1, { mediaId: 404 }),
    ]);
    movies.find.mockResolvedValue([{ mediaId: 7, poster: '/movie.jpg' }]);
    shows.find.mockResolvedValue([{ mediaId: 9, poster: '/show.jpg' }]);

    const { notifications } = await service.list('alice', { status: 'unread' });

    expect(movies.find).toHaveBeenCalledWith({
      where: { mediaId: In([7, 404]) },
      select: { mediaId: true, poster: true },
    });
    expect(notifications.map(({ poster }) => poster)).toEqual(['/movie.jpg', '/show.jpg', null]);
    expect(notifications[0]).toMatchObject({ quality: 'FHD', sourceType: 'BLURAY' });
  });

  it('stores the announced source quality', async () => {
    const { service, watchlists, progress, query, repository } = setupTest();
    watchlists.findLocalWatchlistOwners.mockResolvedValue(['alice']);
    progress.findUserIdsForMovie.mockResolvedValue([]);

    await service.movieQualityUpgrade({
      mediaId: 42,
      title: 'Example Film',
      qualityKey: 'blu-ray',
      previousQuality: 'CAM',
      nextQuality: 'Blu-ray',
      source: { quality: Quality.FHD, sourceType: Source.BLURAY },
      previousSourceType: Source.CAM,
    });
    expect(query.values).toHaveBeenCalledWith([
      expect.objectContaining({ quality: 'FHD', sourceType: 'BLURAY', previousSourceType: 'CAM' }),
    ]);

    query.values.mockClear();
    repository.find.mockResolvedValue([{ userId: 'alice' }]);
    await service.playableAvailable({ kind: 'movie', mediaId: 1 }, 'Film', {
      quality: Quality['4K'],
      sourceType: Source.WEB,
    });
    expect(query.values).toHaveBeenCalledWith([
      expect.objectContaining({ quality: '4K', sourceType: 'WEB', previousSourceType: null }),
    ]);
  });

  it('counts unread notifications and marks all of them read for one user', async () => {
    const { service, repository } = setupTest();
    repository.count.mockResolvedValue(3);
    repository.exists.mockResolvedValue(true);
    repository.update.mockResolvedValue({ affected: 3 });

    await expect(service.counts('alice')).resolves.toEqual({ unreadCount: 3, hasRead: true });
    expect(repository.count).toHaveBeenCalledWith({ where: { userId: 'alice', readAt: IsNull() } });

    await expect(service.markAllRead('alice')).resolves.toBe(3);
    expect(repository.update).toHaveBeenCalledWith(
      { userId: 'alice', readAt: IsNull() },
      { readAt: expect.any(Date) }
    );
  });
});
