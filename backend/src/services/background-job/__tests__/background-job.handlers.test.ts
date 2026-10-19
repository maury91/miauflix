import { configureFakerSeed } from '@__test-utils__/utils';

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
  };
  const downloadService = {
    isEpisodeFileComplete: jest.fn().mockResolvedValue(false),
    predownloadEpisode: jest.fn().mockResolvedValue(true),
  };

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
    worker,
  });

  return {
    handlers,
    listService,
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
    expect(downloadService.predownloadEpisode).toHaveBeenCalledWith(
      episodeSource.source,
      'Show.S01E08.mkv'
    );
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
});
