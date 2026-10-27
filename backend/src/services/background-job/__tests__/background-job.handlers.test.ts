import { configureFakerSeed } from '@__test-utils__/utils';

import { PlaybackTargetService } from '@services/playback/playback-target.service';

import { registerBackgroundJobHandlers } from '../background-job.handlers';
import type { BackgroundJobWorker } from '../background-job.worker';

type StoredHandler = { run: (payload: unknown) => Promise<void> };

const setupTest = () => {
  const handlers = new Map<string, StoredHandler>();
  const worker = {
    register: (type: string, handler: StoredHandler) => handlers.set(type, handler),
  } as unknown as BackgroundJobWorker;
  const episodeSource = {
    source: { id: 45, streamingScore: 90 },
    videoFilePath: 'Show.S01E08.mkv',
    matchKind: 'single',
  };
  const listService = {
    getLocalTVWatchlistOwners: jest.fn().mockResolvedValue(['user-1']),
    hasAnyTVWatchlistInterest: jest.fn().mockResolvedValue(true),
  };
  const mediaService = {
    getTVShowByMediaId: jest.fn().mockResolvedValue({
      local: { name: 'Show', imdbId: 'tt1234567' },
      detail: { seasons: [{ seasonNumber: 1 }] },
    }),
    getSeason: jest.fn().mockResolvedValue({
      episodes: Array.from({ length: 8 }, (_, index) => ({
        id: 101 + index,
        episodeNumber: index + 1,
        airDate: '2020-01-01',
      })),
    }),
  };
  const progressService = {
    findEpisodeProgressForShow: jest.fn().mockResolvedValue([
      {
        userId: 'user-1',
        playableKey: 'e:9001:1:7',
        state: 'completed',
        updatedAt: new Date(),
      },
    ]),
  };
  const sourceService = {
    getSourcesForEpisodeWithOnDemandSearch: jest.fn().mockResolvedValue([episodeSource]),
    isEpisodeWithinLeakTolerance: jest.fn(
      (airDate: string | null, now: number) => !airDate || Date.parse(airDate) <= now
    ),
  };
  const downloadService = {
    isFileComplete: jest.fn().mockResolvedValue(false),
    predownload: jest.fn().mockResolvedValue(true),
    resolveLayout: jest
      .fn()
      .mockResolvedValue({ files: [{ path: 'Show.S01E08.mkv', length: 1_000_000 }] }),
  };
  const playbackTargets = new PlaybackTargetService(
    { getContentSourceRepository: () => ({}), getEpisodeSourceRepository: () => ({}) } as never,
    downloadService as never
  );

  registerBackgroundJobHandlers({
    backgroundJobs: { enqueueBulk: jest.fn() } as never,
    cacheService: {} as never,
    listService: listService as never,
    listClient: { isReady: () => true } as never,
    magnetService: { getAvailableConcurrency: () => 1 } as never,
    mediaService: mediaService as never,
    sourceService: sourceService as never,
    downloadService: downloadService as never,
    progressService: progressService as never,
    playbackTargets,
    worker,
  });

  return {
    handlers,
    listService,
    mediaService,
    progressService,
    sourceService,
    downloadService,
    episodeSource,
  };
};

describe('watchlist TV acquisition', () => {
  beforeAll(() => configureFakerSeed());
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-12T00:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('starts at the episode after the latest watched episode', async () => {
    const { handlers, sourceService, downloadService, episodeSource } = setupTest();
    const acquisition = handlers.get('watchlist.tv.acquire');
    expect(acquisition).toBeDefined();

    await acquisition!.run({ showMediaId: 9001 });

    expect(sourceService.getSourcesForEpisodeWithOnDemandSearch).toHaveBeenCalledTimes(1);
    expect(sourceService.getSourcesForEpisodeWithOnDemandSearch).toHaveBeenCalledWith(
      expect.objectContaining({ episodeId: 108, seasonNumber: 1, episodeNumber: 8 })
    );
    expect(downloadService.predownload).toHaveBeenCalledWith(
      { source: episodeSource.source, filePath: 'Show.S01E08.mkv', matchKind: 'single' },
      { kind: 'watchlist', ownerKey: 'watchlist:tv:9001' }
    );
  });

  it('renews the watchlist claim for a completed match and moves on', async () => {
    const { handlers, downloadService, sourceService, episodeSource } = setupTest();
    downloadService.isFileComplete.mockResolvedValueOnce(true);

    await handlers.get('watchlist.tv.acquire')!.run({ showMediaId: 9001 });

    expect(downloadService.predownload).toHaveBeenCalledWith(
      { source: episodeSource.source, filePath: 'Show.S01E08.mkv', matchKind: 'single' },
      { kind: 'watchlist', ownerKey: 'watchlist:tv:9001' }
    );
    // Only episode 8 exists after the watched one, so the loop ends after renewing it.
    expect(sourceService.getSourcesForEpisodeWithOnDemandSearch).toHaveBeenCalledTimes(1);
  });

  it.each(['playing', 'paused'] as const)(
    'retries the latest episode when its progress is %s',
    async state => {
      const { handlers, progressService, sourceService } = setupTest();
      progressService.findEpisodeProgressForShow.mockResolvedValueOnce([
        {
          userId: 'user-1',
          playableKey: 'e:9001:1:7',
          state,
          updatedAt: new Date(),
        },
      ]);

      await handlers.get('watchlist.tv.acquire')!.run({ showMediaId: 9001 });

      expect(sourceService.getSourcesForEpisodeWithOnDemandSearch).toHaveBeenCalledWith(
        expect.objectContaining({ episodeId: 107, seasonNumber: 1, episodeNumber: 7 })
      );
    }
  );

  it('searches an unaired next episode once it is within the leak tolerance window', async () => {
    const { handlers, mediaService, sourceService } = setupTest();
    const episodes = Array.from({ length: 8 }, (_, index) => ({
      id: 101 + index,
      episodeNumber: index + 1,
      airDate: index === 7 ? '2026-10-13' : '2020-01-01',
    }));
    mediaService.getSeason.mockResolvedValue({ episodes });
    sourceService.isEpisodeWithinLeakTolerance.mockImplementation(
      (airDate: string | null, now: number) =>
        !airDate || Date.parse(airDate) <= now + 2 * 86_400_000
    );

    await handlers.get('watchlist.tv.acquire')!.run({ showMediaId: 9001 });

    expect(sourceService.isEpisodeWithinLeakTolerance).toHaveBeenCalledWith(
      '2026-10-13',
      expect.any(Number)
    );
    expect(sourceService.getSourcesForEpisodeWithOnDemandSearch).toHaveBeenCalledWith(
      expect.objectContaining({ episodeId: 108, episodeNumber: 8 })
    );
  });

  it('stops before an unaired episode outside the leak tolerance window', async () => {
    const { handlers, mediaService, sourceService } = setupTest();
    mediaService.getSeason.mockResolvedValue({
      episodes: Array.from({ length: 8 }, (_, index) => ({
        id: 101 + index,
        episodeNumber: index + 1,
        airDate: index === 7 ? '2026-11-30' : '2020-01-01',
      })),
    });

    await handlers.get('watchlist.tv.acquire')!.run({ showMediaId: 9001 });

    expect(sourceService.getSourcesForEpisodeWithOnDemandSearch).not.toHaveBeenCalled();
  });
});
