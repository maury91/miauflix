jest.mock('@database/database');
jest.mock('@repositories/movie.repository');
jest.mock('@repositories/content-source.repository');
jest.mock('@services/source/source-metadata-file.service');
jest.mock('@services/configuration/configuration.service');
jest.mock('@logger');
jest.mock('parse-torrent');

import {
  createMockContentSource,
  createMockMovie,
  createMockSourceMetadata,
} from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed } from '@__test-utils__/utils';
import { logger as mockLogger } from '@logger';
import type { SourceSearchItem } from '@miauflix/service-contracts';
import parseTorrent from 'parse-torrent';

import { Database } from '@database/database';
import type { ContentSource } from '@entities/content-source.entity';
import { ErrorWithStatus } from '@errors/error-with-status.error';
import { ContentSourceRepository } from '@repositories/content-source.repository';
import { MovieRepository } from '@repositories/movie.repository';
import { ConfigurationService } from '@services/configuration/configuration.service';
import { SourceService } from '@services/source/source.service';
import { SourceMetadataFileService } from '@services/source/source-metadata-file.service';

const createSourceServiceDependencies = () => ({
  backgroundJobs: {
    bulkBestEffort: jest.fn(),
    enqueueBestEffort: jest.fn(),
    enqueueBulk: jest.fn().mockResolvedValue(undefined),
  },
  notifications: {
    episodeAvailable: jest.fn().mockResolvedValue(undefined),
    movieQualityUpgrade: jest.fn().mockResolvedValue(undefined),
  },
  availability: { recordTorrentFile: jest.fn().mockResolvedValue(null) },
});
const sourceServiceDependencies = () => {
  const { backgroundJobs, notifications, availability } = createSourceServiceDependencies();
  return {
    backgroundJobs: backgroundJobs as never,
    notifications: notifications as never,
    availability: availability as never,
  };
};
const candidateItem = (source = createMockSourceMetadata()): SourceSearchItem => ({
  type: 'candidate',
  candidate: { ...source, uploadDate: source.uploadDate.toISOString() },
});
const summaryItem: SourceSearchItem = {
  type: 'summary',
  providersSearched: ['indexer-a'],
  providersFailed: [],
  providersSkipped: [],
  complete: true,
  retryAfter: '2026-12-01T00:00:00.000Z',
};

const setupTest = () => {
  const mockMovie = createMockMovie();
  const mockSource1 = createMockSourceMetadata();
  const mockSource2 = createMockSourceMetadata();
  const mockContentSource1 = createMockContentSource({ hash: mockSource1.hash });
  const mockContentSource2 = createMockContentSource({ hash: mockSource2.hash });
  const mockMovieRepository = new MovieRepository({} as never) as jest.Mocked<MovieRepository>;
  const mockContentSourceRepository = new ContentSourceRepository(
    {} as never
  ) as jest.Mocked<ContentSourceRepository>;
  const mockDatabase = new Database({} as never) as jest.Mocked<Database>;
  const mockConfigService = new ConfigurationService() as jest.Mocked<ConfigurationService>;
  mockConfigService.get.mockReturnValue(undefined as never);
  mockConfigService.getOrThrow.mockReturnValue(false as never);
  const mockPeers = { getStatus: jest.fn().mockReturnValue({ status: 'ready', vpn: 'protected' }) };
  const mockRequestService = { request: jest.fn() };
  const mockSourceMetadataFileService = new SourceMetadataFileService(
    {} as never,
    {} as never,
    mockConfigService
  ) as jest.Mocked<SourceMetadataFileService>;
  mockSourceMetadataFileService.getStats.mockResolvedValue({ broadcasters: 100, watchers: 10 });
  mockSourceMetadataFileService.getAvailableConcurrency.mockReturnValue(2);
  mockSourceMetadataFileService.getSourceMetadataFile.mockResolvedValue(null);
  const mockSourcesClient = {
    search: jest.fn().mockImplementation(async function* () {
      yield candidateItem(mockSource1);
      yield summaryItem;
    }),
    torrentFile: jest.fn().mockResolvedValue(null),
    isReady: jest.fn().mockReturnValue(true),
  };
  mockMovieRepository.findMoviesPendingSourceSearch.mockResolvedValue([mockMovie]);
  mockMovieRepository.findById.mockResolvedValue(mockMovie);
  mockMovieRepository.recordSourceSearch.mockResolvedValue(undefined);
  mockMovieRepository.markSourceSearchAttempt.mockResolvedValue(undefined);
  mockMovieRepository.updateMovieTrailerIfDoesntExists.mockResolvedValue(undefined);
  mockContentSourceRepository.findByMovieId.mockResolvedValue([
    mockContentSource1,
    mockContentSource2,
  ]);
  mockContentSourceRepository.upsertForMovie.mockResolvedValue([
    mockContentSource1,
    mockContentSource2,
  ]);
  mockContentSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValue([]);
  mockContentSourceRepository.getNextSourcesToProcess.mockResolvedValue([]);
  mockDatabase.getMovieRepository.mockReturnValue(mockMovieRepository);
  mockDatabase.getContentSourceRepository.mockReturnValue(mockContentSourceRepository);
  Object.assign(mockDatabase, {
    getEpisodeSourceRepository: jest
      .fn()
      .mockReturnValue({ findByEpisodeId: jest.fn().mockResolvedValue([]) }),
  });
  const service = new SourceService({
    db: mockDatabase,
    peers: mockPeers,
    sourcesClient: mockSourcesClient as never,
    magnetService: mockSourceMetadataFileService,
    config: mockConfigService,
    ...sourceServiceDependencies(),
  });
  return {
    service,
    mockMovie,
    mockSource1,
    mockSource2,
    mockContentSource1,
    mockContentSource2,
    mockMovieRepository,
    mockContentSourceRepository,
    mockDatabase,
    mockConfigService,
    mockPeers,
    mockSourcesClient,
    mockRequestService,
    mockSourceMetadataFileService,
  };
};
const createServiceWithUnprotectedPeers = () => {
  const mocks = setupTest();
  mocks.mockPeers.getStatus.mockReturnValue({ status: 'ready', vpn: 'unprotected' });
  const service = new SourceService({
    db: mocks.mockDatabase,
    peers: mocks.mockPeers,
    sourcesClient: mocks.mockSourcesClient as never,
    magnetService: mocks.mockSourceMetadataFileService,
    config: mocks.mockConfigService,
    ...sourceServiceDependencies(),
  });
  return { ...mocks, service };
};
const createMockSourceForStats = (overrides: Partial<ContentSource> = {}) =>
  createMockContentSource({
    file: Buffer.from('mock file'),
    lastStatsCheck: new Date(Date.now() - 7 * 60 * 60_000),
    nextStatsCheckAt: new Date(Date.now() - 1000),
    ...overrides,
  });

describe('SourceService', () => {
  beforeAll(() => configureFakerSeed());
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  describe('episode availability', () => {
    const now = Date.parse('2026-10-19T12:00:00Z');

    it.each([undefined, null, '', 'unknown', '2026-10-18', '2026-10-19T12:00:00Z'])(
      'allows available or unknown air dates: %s',
      airDate => {
        const { service } = setupTest();
        expect(service.isEpisodeWithinLeakTolerance(airDate, now)).toBe(true);
      }
    );

    it('allows the configured boundary but rejects dates beyond it', () => {
      const { service, mockConfigService } = setupTest();
      mockConfigService.get.mockReturnValue((2 * 24 * 60 * 60 * 1000) as never);
      expect(service.isEpisodeWithinLeakTolerance('2026-10-21T12:00:00Z', now)).toBe(true);
      expect(service.isEpisodeWithinLeakTolerance('2026-10-21T12:00:00.001Z', now)).toBe(false);
    });

    it('skips episode source lookup before the availability window', async () => {
      const { service, mockDatabase } = setupTest();
      const findByEpisodeId = mockDatabase.getEpisodeSourceRepository().findByEpisodeId;
      expect(
        await service.getSourcesForEpisodeWithOnDemandSearch({
          episodeId: 1,
          showImdbId: 'tt1234567',
          seasonNumber: 1,
          episodeNumber: 1,
          airDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
      ).toEqual([]);
      expect(findByEpisodeId).not.toHaveBeenCalled();
    });
  });

  describe('new episode notifications', () => {
    const setupEpisodeTest = (hasVideo: boolean | null) => {
      const mocks = setupTest();
      const association = {
        episodeId: 5,
        sourceId: 11,
        matchKind: 'single',
        source: { id: 11, hasVideo },
      };
      const episodeSources = {
        findByEpisodeId: jest.fn().mockResolvedValueOnce([]).mockResolvedValue([association]),
        associate: jest.fn(),
      };
      Object.assign(mocks.mockDatabase, {
        getEpisodeSourceRepository: jest.fn().mockReturnValue(episodeSources),
      });
      const notifications = { episodeAvailable: jest.fn() };
      const backgroundJobs = { bulkBestEffort: jest.fn(), enqueueBestEffort: jest.fn() };
      const service = new SourceService({
        db: mocks.mockDatabase,
        peers: mocks.mockPeers,
        sourcesClient: mocks.mockSourcesClient as never,
        magnetService: mocks.mockSourceMetadataFileService,
        config: mocks.mockConfigService,
        backgroundJobs: backgroundJobs as never,
        notifications: notifications as never,
        availability: createSourceServiceDependencies().availability as never,
      });
      const releases = jest.spyOn(service as never, 'getTVReleases').mockResolvedValue([
        {
          metadata: { season: 1, episode: 8, files: ['Show.S01E08.mkv'] },
          source: { id: 11, hasVideo },
        },
      ] as never);
      const search = (
        numbers: Partial<
          Parameters<SourceService['getSourcesForEpisodeWithOnDemandSearch']>[0]
        > = {}
      ) =>
        service.getSourcesForEpisodeWithOnDemandSearch({
          episodeId: 5,
          showMediaId: 9001,
          showTitle: 'Example Show',
          showImdbId: 'tt1234567',
          seasonNumber: 1,
          episodeNumber: 8,
          airDate: '2020-01-01',
          ...numbers,
        });
      return { search, notifications, backgroundJobs, releases, episodeSources, ...mocks };
    };

    it('reuses stored single-file matches that have a live swarm', async () => {
      const { search, releases, episodeSources } = setupEpisodeTest(true);
      episodeSources.findByEpisodeId.mockReset().mockResolvedValue([
        {
          episodeId: 5,
          sourceId: 11,
          matchKind: 'single',
          source: { id: 11, broadcasters: 40, languages: [] },
        },
      ]);

      await search();

      expect(releases).not.toHaveBeenCalled();
    });

    it('searches again once for matches stored before their languages were recorded', async () => {
      const { search, releases, episodeSources } = setupEpisodeTest(true);
      episodeSources.findByEpisodeId.mockReset().mockResolvedValue([
        {
          episodeId: 5,
          sourceId: 11,
          matchKind: 'single',
          source: { id: 11, broadcasters: 40, languages: null },
        },
      ]);

      await search();
      await search();

      expect(releases).toHaveBeenCalledTimes(1);
    });

    it('searches again when every stored match is weak, at most every six hours', async () => {
      const { search, releases, episodeSources } = setupEpisodeTest(true);
      episodeSources.findByEpisodeId
        .mockReset()
        .mockResolvedValue([
          { episodeId: 5, sourceId: 11, matchKind: 'single', source: { id: 11, broadcasters: 4 } },
        ]);

      await search();
      await search();
      expect(releases).toHaveBeenCalledTimes(1);

      jest.setSystemTime(Date.now() + 6 * 60 * 60_000 + 1);
      await search();
      expect(releases).toHaveBeenCalledTimes(2);
    });

    it('announces an episode once a source matched to it is verified', async () => {
      const { search, notifications, backgroundJobs } = setupEpisodeTest(true);

      await search();

      expect(notifications.episodeAvailable).toHaveBeenCalledWith(
        expect.objectContaining({ showMediaId: 9001, seasonNumber: 1, episodeNumber: 8 })
      );
      expect(backgroundJobs.bulkBestEffort).not.toHaveBeenCalled();
    });

    it('searches and matches an anime numbered by AniList entry with TMDB numbering', async () => {
      const { search, notifications, releases, episodeSources } = setupEpisodeTest(true);

      await search({
        seasonNumber: 2,
        episodeNumber: 1,
        providerSeasonNumber: 1,
        providerEpisodeNumber: 8,
      });

      expect(releases).toHaveBeenCalledWith(
        expect.objectContaining({ seasonNumber: 1, episodeNumber: 8 })
      );
      expect(episodeSources.associate).toHaveBeenCalledWith(5, 11, 'Show.S01E08.mkv', 'single');
      // The announcement uses the numbering the app shows.
      expect(notifications.episodeAvailable).toHaveBeenCalledWith(
        expect.objectContaining({ seasonNumber: 2, episodeNumber: 1 })
      );
    });

    it('looks up the files of both candidate releases at the same time', async () => {
      const { search, releases, mockSourcesClient, mockContentSourceRepository } =
        setupEpisodeTest(true);
      releases.mockResolvedValue([
        { metadata: { season: 1, episode: 8 }, source: { id: 21, hash: 'a'.repeat(40) } },
        { metadata: { season: 1, episode: 8 }, source: { id: 22, hash: 'b'.repeat(40) } },
      ] as never);
      mockContentSourceRepository.findById.mockResolvedValue(null);
      // Each lookup only finishes once both have started: one after another would hang.
      let open!: () => void;
      const bothStarted = new Promise<void>(resolve => (open = resolve));
      mockSourcesClient.torrentFile.mockImplementation(async () => {
        if (mockSourcesClient.torrentFile.mock.calls.length === 2) open();
        await bothStarted;
        return null;
      });

      await search();

      expect(mockSourcesClient.torrentFile).toHaveBeenCalledTimes(2);
    });

    it('waits for verification instead of announcing an unverified match', async () => {
      const { search, notifications, backgroundJobs } = setupEpisodeTest(null);

      await search();

      expect(notifications.episodeAvailable).not.toHaveBeenCalled();
      expect(backgroundJobs.bulkBestEffort).toHaveBeenCalledWith([
        expect.objectContaining({ type: 'source.verify', payload: { sourceId: 11 } }),
      ]);
    });

    it('never announces an episode whose only match is fake', async () => {
      const { search, notifications, backgroundJobs } = setupEpisodeTest(false);

      await search();

      expect(notifications.episodeAvailable).not.toHaveBeenCalled();
      expect(backgroundJobs.bulkBestEffort).not.toHaveBeenCalled();
    });
  });

  it('saves streamed candidates and summary even while media-load is not behind a VPN', async () => {
    const {
      service,
      mockMovie,
      mockMovieRepository,
      mockContentSourceRepository,
      mockSourcesClient,
    } = createServiceWithUnprotectedPeers();
    await service.searchSourcesForMovies();
    expect(mockSourcesClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'background',
        media: expect.objectContaining({ tmdbId: mockMovie.mediaId }),
      }),
      expect.any(AbortSignal)
    );
    expect(mockContentSourceRepository.upsertForMovie).toHaveBeenCalledWith(
      mockMovie.id,
      expect.arrayContaining([expect.objectContaining({ source: 'indexer-a' })])
    );
    expect(mockMovieRepository.recordSourceSearch).toHaveBeenCalledWith(
      mockMovie.id,
      ['indexer-a'],
      summaryItem.retryAfter,
      true
    );
  });

  it('keeps failure backoff when the service is unavailable', async () => {
    const { service, mockMovie, mockMovieRepository, mockSourcesClient } = setupTest();
    mockSourcesClient.search.mockImplementation(() => {
      throw new Error('Service not configured');
    });
    await service.searchSourcesForMovies();
    expect(mockMovieRepository.markSourceSearchAttempt).toHaveBeenCalledWith(mockMovie.id);
  });

  it('honors the summary retry date without consulting legacy directory state', async () => {
    const { service, mockMovie, mockSourcesClient } = setupTest();
    expect(await service.processSourceDiscovery(mockMovie.id)).toEqual({
      complete: true,
      sourceCount: 0,
    });
    expect(mockSourcesClient.search).not.toHaveBeenCalled();
  });

  it('passes the catalog ID and release year to interactive movie searches', async () => {
    const { service, mockMovie, mockSourcesClient, mockContentSourceRepository } = setupTest();
    const movie = { ...mockMovie, id: 7, mediaId: 9001, releaseDate: '2020-05-01' };
    mockContentSourceRepository.findByMovieId.mockResolvedValue([]);

    await service.getSourcesForMovieWithOnDemandSearch(movie);

    expect(mockSourcesClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'interactive',
        media: expect.objectContaining({ tmdbId: 9001, releaseDate: '2020-05-01', year: 2020 }),
      }),
      expect.any(AbortSignal)
    );
  });

  it.each(
    (['rejected', 'missing', 'remote', 'stored'] as const).flatMap(outcome =>
      [true, false].map(vpnConnected => ({ outcome, vpnConnected }))
    )
  )(
    'resolves TV metadata safely with Sources=$outcome and VPN=$vpnConnected',
    async ({ outcome, vpnConnected }) => {
      const {
        service,
        mockContentSource1,
        mockDatabase,
        mockContentSourceRepository,
        mockSourcesClient,
        mockSourceMetadataFileService,
      } = vpnConnected ? setupTest() : createServiceWithUnprotectedPeers();
      const torrentFile = Buffer.from('TV pack metadata');
      const source = {
        ...mockContentSource1,
        file: outcome === 'stored' ? torrentFile : undefined,
        magnetLink: 'magnet:?xt=urn:btih:' + mockContentSource1.hash,
      };
      const episodeSources = mockDatabase.getEpisodeSourceRepository();
      const associate = jest.fn().mockResolvedValue(undefined);
      Object.assign(episodeSources, { associate });
      jest
        .spyOn(service as never, 'getTVReleases')
        .mockResolvedValue([{ metadata: { season: 1, files: [] }, source }] as never);
      mockContentSourceRepository.findById.mockResolvedValue(source);
      if (outcome === 'rejected') {
        mockSourcesClient.torrentFile.mockRejectedValue(new Error('Sources unavailable'));
      } else {
        mockSourcesClient.torrentFile.mockResolvedValue(outcome === 'remote' ? torrentFile : null);
      }
      mockSourceMetadataFileService.getPlaybackTorrentMetadataFile.mockResolvedValue(torrentFile);
      (parseTorrent as unknown as jest.Mock).mockResolvedValue({
        infoHash: source.hash,
        files: [{ path: 'Show.S01E08.mkv' }],
      });

      await service.getSourcesForEpisodeWithOnDemandSearch({
        episodeId: 5,
        showImdbId: 'tt1234567',
        seasonNumber: 1,
        episodeNumber: 8,
        airDate: '2020-01-01',
      });

      const needsPeers = outcome === 'rejected' || outcome === 'missing';
      if (needsPeers && !vpnConnected) {
        expect(associate).not.toHaveBeenCalled();
      } else {
        expect(associate).toHaveBeenCalledWith(5, source.id, 'Show.S01E08.mkv', 'single');
      }
      if (needsPeers && vpnConnected) {
        expect(mockSourceMetadataFileService.getPlaybackTorrentMetadataFile).toHaveBeenCalledWith(
          source.magnetLink,
          source.hash
        );
      } else {
        expect(mockSourceMetadataFileService.getPlaybackTorrentMetadataFile).not.toHaveBeenCalled();
      }
      if (outcome === 'stored') expect(mockSourcesClient.torrentFile).not.toHaveBeenCalled();
    }
  );

  it('returns existing sources immediately', async () => {
    const { service, mockMovie, mockContentSource1, mockContentSource2, mockSourcesClient } =
      setupTest();
    expect(await service.getSourcesForMovieWithOnDemandSearch(mockMovie)).toEqual([
      mockContentSource1,
      mockContentSource2,
    ]);
    expect(mockSourcesClient.search).not.toHaveBeenCalled();
  });

  it('returns persisted partial candidates at the deadline and continues draining', async () => {
    const {
      service,
      mockMovie,
      mockSourcesClient,
      mockContentSourceRepository,
      mockMovieRepository,
    } = setupTest();
    let release!: () => void;
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });
    mockContentSourceRepository.findByMovieId.mockResolvedValueOnce([]);
    mockSourcesClient.search.mockImplementation(async function* () {
      yield candidateItem();
      await blocked;
      yield summaryItem;
    });
    const result = service.getSourcesForMovieWithOnDemandSearch(mockMovie, 500);
    await jest.advanceTimersByTimeAsync(500);
    expect(await result).toHaveLength(2);
    expect(mockContentSourceRepository.upsertForMovie).toHaveBeenCalledTimes(1);
    expect(service.isOnDemandSearchPending(mockMovie.id)).toBe(true);
    release();
    await jest.advanceTimersByTimeAsync(1);
    expect(mockMovieRepository.recordSourceSearch).toHaveBeenCalledTimes(1);
    expect(service.isOnDemandSearchPending(mockMovie.id)).toBe(false);
  });

  it('verifies remote metadata identity before saving it', async () => {
    const { service, mockContentSource1, mockContentSourceRepository, mockSourcesClient } =
      setupTest();
    mockContentSourceRepository.findById.mockResolvedValue({
      ...mockContentSource1,
      file: undefined,
    });
    mockSourcesClient.torrentFile.mockResolvedValue(Buffer.from('untrusted file'));
    (parseTorrent as unknown as jest.Mock).mockResolvedValue({ infoHash: 'mismatched-hash' });
    await service.processSourceMetadata(mockContentSource1.id).catch(() => undefined);
    expect(mockContentSourceRepository.updateSourceFile).not.toHaveBeenCalled();
  });

  it('aborts a still-draining search only on service shutdown', async () => {
    const { service, mockSourcesClient } = setupTest();
    await service.searchSourcesForMovies();
    const signal = mockSourcesClient.search.mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);
    service.stop();
    expect(signal.aborted).toBe(true);
  });
  describe('syncStatsForSources', () => {
    it('should update stats for sources that need updates', async () => {
      const { service, mockSource1, mockContentSourceRepository, mockSourceMetadataFileService } =
        setupTest();

      const newWatchers = mockSource1.watchers + 10;
      const newBroadcasters = mockSource1.broadcasters + 10;

      const sourceToUpdate = createMockSourceForStats({
        hash: mockSource1.hash,
      });
      mockContentSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce([
        sourceToUpdate,
      ]);
      mockSourceMetadataFileService.getStats.mockResolvedValueOnce({
        broadcasters: newBroadcasters,
        watchers: newWatchers,
      });

      await service.syncStatsForSources();

      // It processes 5 sources at a time
      expect(mockContentSourceRepository.findSourceThatNeedsStatsUpdate).toHaveBeenCalledWith(5);

      // But we only return one source so it should be called only once
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledTimes(1);
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledWith(sourceToUpdate.hash);

      // And it should update the stats for the source
      expect(mockContentSourceRepository.updateStats).toHaveBeenCalledWith(
        sourceToUpdate,
        newBroadcasters,
        newWatchers,
        expect.any(Date)
      );
    });

    it('should update stats also for sources without file', async () => {
      const { service, mockSource1, mockSourceMetadataFileService, mockContentSourceRepository } =
        setupTest();

      const sourceWithoutFile = createMockSourceForStats({
        hash: mockSource1.hash,
        file: undefined,
      });
      const newWatchers = mockSource1.watchers + 10;
      const newBroadcasters = mockSource1.broadcasters + 10;

      mockContentSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce([
        sourceWithoutFile,
      ]);
      mockSourceMetadataFileService.getStats.mockResolvedValueOnce({
        broadcasters: newBroadcasters,
        watchers: newWatchers,
      });

      await service.syncStatsForSources();

      // It can't getStats if there's no file to load
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledTimes(1);
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledWith(sourceWithoutFile.hash);

      // And it should update the stats for the source
      expect(mockContentSourceRepository.updateStats).toHaveBeenCalledWith(
        sourceWithoutFile,
        newBroadcasters,
        newWatchers,
        expect.any(Date)
      );
    });

    it('should handle magnet service errors gracefully', async () => {
      const { service, mockSource1, mockSourceMetadataFileService, mockContentSourceRepository } =
        setupTest();

      const sourceToUpdate = createMockSourceForStats({
        hash: mockSource1.hash,
      });
      mockContentSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce([
        sourceToUpdate,
      ]);
      mockSourceMetadataFileService.getStats.mockRejectedValueOnce(new Error('Stats fetch failed'));

      await service.syncStatsForSources();

      // getStats was correctly called but it failed
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledWith(sourceToUpdate.hash);

      // So it should not update the stats for the source
      expect(mockContentSourceRepository.updateStats).not.toHaveBeenCalled();
    });

    it('should classify scrape timeouts as expected debug events', async () => {
      const { service, mockSource1, mockSourceMetadataFileService, mockContentSourceRepository } =
        setupTest();
      const sourceToUpdate = createMockSourceForStats({ hash: mockSource1.hash });
      mockContentSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce([
        sourceToUpdate,
      ]);
      mockSourceMetadataFileService.getStats.mockRejectedValueOnce(
        new ErrorWithStatus('Scrape request timed out', 'scrape_timeout')
      );

      await service.syncStatsForSources();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'SourceService',
        `Stats scrape timed out for source ${sourceToUpdate.id} (quality: ${sourceToUpdate.quality})`
      );
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        'SourceService',
        expect.stringContaining(`source ${sourceToUpdate.id}`),
        expect.anything()
      );
      expect(mockContentSourceRepository.updateStats).not.toHaveBeenCalled();
    });

    it('should skip when media-load is not behind a VPN', async () => {
      const { service, mockContentSourceRepository } = createServiceWithUnprotectedPeers();
      await service.syncStatsForSources();

      expect(mockContentSourceRepository.findSourceThatNeedsStatsUpdate).not.toHaveBeenCalled();
    });
  });
});
