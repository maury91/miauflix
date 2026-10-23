jest.mock('./torrent-diagnostics');
jest.mock('./encrypted-file-reader', () => ({
  EncryptedFileReader: jest.fn().mockImplementation(() => ({
    readPiece: jest.fn().mockResolvedValue(Buffer.alloc(10)),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { EventEmitter } from 'node:events';

import {
  createMockStorage,
  createMockStorageWithHash,
  createMockStorageWithoutContentSource,
  createMockStorageWithUndefinedHash,
} from '@__test-utils__/mocks/storage.mock';
import { logger } from '@logger';
import { Client as BTClient } from 'bittorrent-tracker';
import loadIPSet from 'load-ip-set';
import type { Torrent } from 'webtorrent';

import { Database } from '@database/database';
import type { EncryptedStorageLayout, Storage } from '@entities/storage.entity';
import { ConfigurationService } from '@services/configuration/configuration.service';
import type { PlaybackTarget } from '@services/playback/playback-target';
import type { RequestServiceResponse } from '@services/request/request.service';
import { RequestService } from '@services/request/request.service';
import { StatsService } from '@services/stats/stats.service';
import { StorageService } from '@services/storage/storage.service';

import { mockedTorrentInstance } from '../../__mocks__/webtorrent';
import { DownloadService } from './download.service';

// Mock all external dependencies
jest.mock('bittorrent-tracker');
jest.mock('load-ip-set');
jest.mock('@logger');
jest.mock('@services/storage/storage.service');
jest.mock('@services/request/request.service');
jest.mock('@database/database');
jest.mock('@services/configuration/configuration.service');

type TestConfigurationService = ConfigurationService & {
  setSeedDurationSeconds: (seconds: number) => void;
};

const createMockConfig = (seedDurationSeconds = 3600): TestConfigurationService => {
  const values: Record<string, unknown> = {
    CONTENT_CONNECTION_LIMIT: 100,
    CONTENT_DOWNLOAD_LIMIT: 1000000,
    CONTENT_UPLOAD_LIMIT: 500000,
    CONTENT_SEED_DURATION_SECONDS: seedDurationSeconds,
    DISABLE_DISCOVERY: false,
    STATIC_TRACKERS: ['udp://tracker1.example.com:1337', 'udp://tracker2.example.com:1337'],
    SCRAPE_TRACKERS: ['udp://tracker.opentrackr.org:1337/announce'],
    BEST_TRACKERS_DOWNLOAD_URL: 'https://example.com/trackers_best.txt',
    BLACKLISTED_TRACKERS_DOWNLOAD_URL: 'https://example.com/blacklist.txt',
    DOWNLOAD_PATH: '/tmp/test-downloads',
    DOWNLOAD_SALT: 'a'.repeat(32),
    SOURCE_SECURITY_KEY: 'b'.repeat(32),
  };
  const mockedConfigService =
    new ConfigurationService() as unknown as jest.Mocked<ConfigurationService>;
  mockedConfigService.get.mockImplementation((key: string) => values[key] as never);
  mockedConfigService.getOrThrow.mockImplementation((key: string) => {
    if (key in values) return values[key] as never;
    throw new Error(`${key} is not set`);
  });
  return Object.assign(mockedConfigService, {
    setSeedDurationSeconds: (seconds: number) => {
      values.CONTENT_SEED_DURATION_SECONDS = seconds;
    },
  }) as TestConfigurationService;
};

const WATCHED = { kind: 'watched', ownerKey: 'user:test' } as const;

const target = (source: unknown, filePath = 'movie.mkv') =>
  ({ source, filePath, matchKind: 'movie' }) as unknown as PlaybackTarget;

describe('DownloadService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupTest = (mockConfig?: {
    seedDurationSeconds?: number;
    requestServiceMock?: (mock: jest.Mocked<RequestService>) => void;
    loadIPSetMock?: (mock: jest.MockedFunction<typeof loadIPSet>) => void;
  }) => {
    const configService = createMockConfig(mockConfig?.seedDurationSeconds);

    // Mock BT Client
    const mockBTClient = {
      once: jest.fn(),
      scrape: jest.fn(),
      destroy: jest.fn(),
    } as unknown as jest.Mocked<BTClient>;

    (BTClient as jest.MockedClass<typeof BTClient>).mockImplementation(() => mockBTClient);

    // Mock RequestService
    const mockRequestService = new RequestService(
      new StatsService(),
      configService
    ) as unknown as jest.Mocked<RequestService>;

    // Mock loadIPSet
    const mockLoadIPSet = loadIPSet as jest.MockedFunction<typeof loadIPSet>;

    // Apply mock configurations before creating service
    if (mockConfig?.requestServiceMock) {
      mockConfig.requestServiceMock(mockRequestService);
    }
    if (mockConfig?.loadIPSetMock) {
      mockConfig.loadIPSetMock(mockLoadIPSet);
    }

    // Mock StorageService as EventEmitter
    const mockStorageService = new StorageService(
      new Database({} as never),
      configService
    ) as jest.Mocked<StorageService>;

    // Claim-aware defaults: no files recorded and no live claims until a test says otherwise.
    mockStorageService.getFiles.mockResolvedValue([]);
    mockStorageService.getClaimedPaths.mockResolvedValue([]);
    mockStorageService.getLiveClaims.mockResolvedValue([]);
    mockStorageService.deleteClaims.mockResolvedValue([]);
    mockStorageService.getSpeculativeSourceIds.mockResolvedValue([]);

    const service = new DownloadService(mockStorageService, mockRequestService, configService);
    mockStorageService.withSourceLock.mockImplementation(async (_id, operation) => operation());

    return {
      service,
      configService,
      mockBTClient,
      mockRequestService,
      mockLoadIPSet,
      mockStorageService,
    };
  };

  describe('storage activity snapshot', () => {
    it('distinguishes incomplete activity from complete offline and local-only content', () => {
      const { service } = setupTest({ seedDurationSeconds: 3600 });
      const completedAt = new Date('2026-10-08T10:00:00Z');
      const baseStorage = {
        location: '/downloads/item',
        localOnly: false,
        videoCompletedAt: null,
        contentSource: { hash: 'AbCd' },
      };
      const torrentList: Torrent[] = [];
      (service.client as unknown as { torrents: Torrent[] }).torrents = torrentList;

      expect(service.getStorageActivity(baseStorage)).toMatchObject({
        activity: 'inactive',
        videoComplete: false,
        torrentLoaded: false,
      });
      expect(service.getStorageActivity({ ...baseStorage, localOnly: true })).toMatchObject({
        activity: 'local_only',
        videoComplete: true,
        torrentLoaded: false,
      });
      expect(service.getStorageActivity({ ...baseStorage, videoCompletedAt: completedAt })).toEqual(
        {
          activity: 'available_offline',
          seedEndsAt: new Date('2026-10-08T11:00:00Z'),
          videoComplete: true,
          torrentLoaded: false,
        }
      );

      torrentList.push({
        infoHash: 'unrelated',
        path: baseStorage.location,
        paused: false,
        done: false,
      } as Torrent);
      expect(service.getStorageActivity(baseStorage).activity).toBe('inactive');
      torrentList[0] = {
        ...torrentList[0],
        infoHash: 'aBcD',
        path: '/downloads/different-path',
      } as Torrent;
      expect(service.getStorageActivity(baseStorage)).toMatchObject({
        activity: 'active',
        videoComplete: false,
        torrentLoaded: true,
      });
      expect(service.getStorageActivity({ ...baseStorage, videoCompletedAt: completedAt })).toEqual(
        {
          activity: 'available_offline',
          seedEndsAt: new Date('2026-10-08T11:00:00Z'),
          videoComplete: true,
          torrentLoaded: true,
        }
      );

      torrentList[0] = { ...torrentList[0], paused: true } as Torrent;
      expect(service.getStorageActivity(baseStorage).activity).toBe('active');
      torrentList[0] = { ...torrentList[0], paused: false } as Torrent;
      (service as unknown as { pausedForPlayback: Set<number> }).pausedForPlayback.add(1);
      expect(service.getStorageActivity(baseStorage).activity).toBe('active');

      torrentList[0] = {
        ...torrentList[0],
        done: false,
        ready: true,
        bitfield: {
          get: (piece: number) => piece < 2,
          buffer: Uint8Array.of(0b11000000),
        },
      } as Torrent;
      // Completion comes from videoCompletedAt, which recordCompletion sets from claims.
      expect(service.getStorageActivity(baseStorage)).toMatchObject({
        activity: 'active',
        videoComplete: false,
        torrentLoaded: true,
      });
    });
  });

  describe('range progress without an attached torrent', () => {
    const layout: EncryptedStorageLayout = {
      storeName: 'test',
      filenameSalt: 'download-AbCd',
      pieceLength: 4,
      files: [{ path: 'video.mkv', length: 5, offset: 3 }],
    };

    it.each([
      ['completed', { videoCompletedAt: new Date('2026-10-10T12:00:00Z') }],
      ['local-only', { localOnly: true }],
    ])('reports the requested video bytes verified for %s media', async (_name, completion) => {
      const { service, mockStorageService } = setupTest();
      const storage = createMockStorage({
        id: 1,
        sourceId: 1,
        location: '/downloads/item',
        encryptedLayout: layout,
        ...completion,
      });
      mockStorageService.getStorageBySource.mockResolvedValue(storage);
      (service.client as unknown as { torrents: Torrent[] }).torrents = [];

      await expect(service.getRangeProgress(1, 'video.mkv', 0, 1)).resolves.toEqual({
        verifiedBytes: 5,
        targetBytes: 5,
        progress: 100,
        isComplete: true,
      });
      await expect(service.getRangeProgress(1, 'video.mkv', 2, 2)).resolves.toEqual({
        verifiedBytes: 0,
        targetBytes: 0,
        progress: 0,
        isComplete: false,
      });
    });

    it('keeps an incomplete result when detached storage is not marked complete', async () => {
      const { service, mockStorageService } = setupTest();
      mockStorageService.getStorageBySource.mockResolvedValue(
        createMockStorage({ encryptedLayout: layout })
      );
      (service.client as unknown as { torrents: Torrent[] }).torrents = [];

      await expect(service.getRangeProgress(1, 'video.mkv', 0, 1)).resolves.toMatchObject({
        verifiedBytes: 0,
        targetBytes: 0,
        progress: 0,
        isComplete: false,
      });
    });

    it('counts only the requested file bytes in boundary pieces for an active torrent', async () => {
      const { service, mockStorageService } = setupTest();
      const storage = createMockStorage({ location: '/downloads/item', encryptedLayout: layout });
      mockStorageService.getStorageBySource.mockResolvedValue(storage);
      (service.client as unknown as { torrents: Torrent[] }).torrents = [
        {
          path: storage.location,
          length: 12,
          pieceLength: 4,
          pieces: [{}, {}, {}],
          bitfield: { get: (piece: number) => piece === 0 },
        } as unknown as Torrent,
      ];

      await expect(service.getRangeProgress(storage.sourceId, 'video.mkv', 0, 1)).resolves.toEqual({
        verifiedBytes: 1,
        targetBytes: 5,
        progress: 20,
        isComplete: false,
      });
    });
  });

  describe('download progress while torrent metadata loads', () => {
    it('returns incomplete progress instead of null before torrent metadata is ready', async () => {
      const { service, mockStorageService } = setupTest();
      const storage = createMockStorage({
        id: 1,
        sourceId: 1,
        location: '/downloads/item',
        encryptedLayout: null,
        downloaded: 2500,
        size: 12,
      });
      mockStorageService.getStorageBySource.mockResolvedValue(storage);
      (service.client as unknown as { torrents: Torrent[] }).torrents = [
        {
          path: storage.location,
          ready: false,
          progress: 0.25,
          downloaded: 3,
          length: 12,
          downloadSpeed: 0,
          done: false,
        } as Torrent,
      ];

      await expect(service.getDownloadProgress(1)).resolves.toMatchObject({
        sourceId: 1,
        progress: 25,
        downloadedBytes: 3,
        totalBytes: 12,
        isComplete: false,
      });
    });

    it('returns progress when a ready torrent has unusable file metadata', async () => {
      const { service, mockStorageService } = setupTest();
      const storage = createMockStorage({
        id: 1,
        sourceId: 1,
        location: '/downloads/item',
        encryptedLayout: null,
        downloaded: 2500,
        size: 12,
      });
      mockStorageService.getStorageBySource.mockResolvedValue(storage);
      (service.client as unknown as { torrents: Torrent[] }).torrents = [
        {
          path: storage.location,
          infoHash: storage.contentSource.hash,
          name: 'pending',
          ready: true,
          files: [],
          progress: 0.25,
          downloaded: 3,
          length: 12,
          downloadSpeed: 0,
          done: false,
        } as unknown as Torrent,
      ];

      await expect(service.getDownloadProgress(1)).resolves.toMatchObject({
        sourceId: 1,
        progress: 25,
        isComplete: false,
      });
    });
  });

  describe('tracker loading', () => {
    it('should load trackers and IP sets on initialization', async () => {
      const { mockRequestService, mockLoadIPSet } = setupTest({
        requestServiceMock: mock => {
          mock.request.mockResolvedValue({
            body: 'udp://tracker1.example.com:1337\nudp://tracker2.example.com:1337\n# comment\n',
            headers: { 'content-type': 'text/plain' },
            ok: true,
            status: 200,
            statusText: 'OK',
          } satisfies RequestServiceResponse<string>);
        },
      });

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockRequestService.request).toHaveBeenCalledWith(
        'https://example.com/trackers_best.txt'
      );
      expect(mockLoadIPSet).toHaveBeenCalledWith(
        'https://example.com/blacklist.txt',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle tracker fetch errors gracefully', async () => {
      setupTest({
        requestServiceMock: mock => {
          mock.request.mockRejectedValue(new Error('Network error'));
        },
      });

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(logger.error).toHaveBeenCalledWith(
        'DownloadService',
        'Error fetching trackers:',
        expect.any(Error)
      );
    });

    it('should handle IP set loading errors gracefully', async () => {
      setupTest({
        loadIPSetMock: mock => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (mock as any).mockImplementation(
            (
              url: string,
              options: unknown,
              callback: (err: Error | null, ipSet: unknown) => void
            ) => {
              callback(new Error('IP set error'), null);
            }
          );
        },
      });

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(logger.error).toHaveBeenCalledWith(
        'DownloadService',
        'Error loading IP set:',
        expect.any(Error)
      );
    });
  });

  describe('generateLink', () => {
    it('should generate a valid magnet link', async () => {
      const { service } = setupTest({
        requestServiceMock: mock => {
          mock.request.mockResolvedValue({
            body: 'udp://tracker2.example.com:1337\nudp://tracker3.example.com:1337',
            headers: { 'content-type': 'text/plain' },
            ok: true,
            status: 200,
            statusText: 'OK',
          } satisfies RequestServiceResponse<string>);
        },
        loadIPSetMock: mock => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (mock as any).mockImplementation(
            (
              url: string,
              options: unknown,
              callback: (err: Error | null, ipSet: unknown) => void
            ) => {
              callback(null, { contains: jest.fn() });
            }
          );
        },
      });

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      const hash = 'abcdef1234567890abcdef1234567890abcdef12';
      const trackers = ['udp://tracker5.example.com:1337'];
      const name = 'Test Movie';

      const result = service.generateLink(hash, trackers, name);

      // Check that each tracker is a separate 'tr' parameter
      expect(result).toContain('tr=udp%3A%2F%2Ftracker5.example.com%3A1337');
      expect(result).toContain('tr=udp%3A%2F%2Ftracker2.example.com%3A1337');
      expect(result).toContain('tr=udp%3A%2F%2Ftracker3.example.com%3A1337');
      expect(result).toContain('tr=udp%3A%2F%2Ftracker1.example.com%3A1337');
      expect(result).toContain('dn=Test+Movie'); // URL encoding uses + for spaces

      // Verify the structure: should have multiple tr= parameters, not comma-separated
      const trParams = result.match(/tr=[^&]+/g);
      expect(trParams).toHaveLength(4);

      // Verify no comma-separated trackers
      expect(result).not.toContain('tr=udp%3A%2F%2Ftracker5.example.com%3A1337%2C');
    });

    it('should handle empty trackers array', async () => {
      const { service } = setupTest({
        requestServiceMock: mock => {
          mock.request.mockResolvedValue({
            body: 'udp://tracker2.example.com:1337\nudp://tracker3.example.com:1337',
            headers: { 'content-type': 'text/plain' },
            ok: true,
            status: 200,
            statusText: 'OK',
          } satisfies RequestServiceResponse<string>);
        },
        loadIPSetMock: mock => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (mock as any).mockImplementation(
            (
              url: string,
              options: unknown,
              callback: (err: Error | null, ipSet: unknown) => void
            ) => {
              callback(null, { contains: jest.fn() });
            }
          );
        },
      });

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      const hash = 'abcdef1234567890abcdef1234567890abcdef12';
      const trackers: string[] = [];

      const result = service.generateLink(hash, trackers);

      // Should only contain the best trackers (no user trackers)
      expect(result).toContain('tr=udp%3A%2F%2Ftracker2.example.com%3A1337');
      expect(result).toContain('tr=udp%3A%2F%2Ftracker3.example.com%3A1337');
      expect(result).toContain('tr=udp%3A%2F%2Ftracker1.example.com%3A1337');

      // Verify the structure: should have 3 tr= parameters
      const trParams = result.match(/tr=[^&]+/g);
      expect(trParams).toHaveLength(3);

      // Verify no comma-separated trackers
      expect(result).not.toContain('tr=udp%3A%2F%2Ftracker2.example.com%3A1337%2C');
    });

    it('should deduplicate trackers', async () => {
      const { service } = setupTest({
        requestServiceMock: mock => {
          mock.request.mockResolvedValue({
            body: 'udp://tracker2.example.com:1337\nudp://tracker3.example.com:1337',
            headers: { 'content-type': 'text/plain' },
            ok: true,
            status: 200,
            statusText: 'OK',
          } satisfies RequestServiceResponse<string>);
        },
        loadIPSetMock: mock => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (mock as any).mockImplementation(
            (
              url: string,
              options: unknown,
              callback: (err: Error | null, ipSet: unknown) => void
            ) => {
              callback(null, { contains: jest.fn() });
            }
          );
        },
      });

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      const hash = 'abcdef1234567890abcdef1234567890abcdef12';
      const trackers = ['udp://tracker4.example.com:1337', 'udp://tracker4.example.com:1337'];

      const result = service.generateLink(hash, trackers);

      // Should deduplicate user trackers and include best trackers
      expect(result).toContain('tr=udp%3A%2F%2Ftracker4.example.com%3A1337');
      expect(result).toContain('tr=udp%3A%2F%2Ftracker2.example.com%3A1337');
      expect(result).toContain('tr=udp%3A%2F%2Ftracker3.example.com%3A1337');
      expect(result).toContain('tr=udp%3A%2F%2Ftracker1.example.com%3A1337');

      // Verify the structure: should have 4 tr= parameters (1 unique user + 3 best)
      const trParams = result.match(/tr=[^&]+/g);
      expect(trParams).toHaveLength(4);

      // Verify no comma-separated trackers
      expect(result).not.toContain('tr=udp%3A%2F%2Ftracker4.example.com%3A1337%2C');
    });
  });

  describe('getSourceMetadataFile', () => {
    it('does not remove an existing torrent', async () => {
      const { service } = setupTest();
      const hash = 'abcdef1234567890abcdef1234567890abcdef12';
      const torrentFile = Buffer.from('existing');
      const torrent = { infoHash: hash, torrentFile } as unknown as Torrent;
      (mockedTorrentInstance as unknown as { torrents: Torrent[] }).torrents = [torrent];

      await expect(
        service.getSourceMetadataFile(`magnet:?xt=urn:btih:${hash}`, hash, 5000)
      ).resolves.toBe(torrentFile);
      expect(mockedTorrentInstance.remove).not.toHaveBeenCalled();
    });

    it('removes only a torrent created for metadata lookup', async () => {
      const { service } = setupTest();
      const hash = 'abcdef1234567890abcdef1234567890abcdef12';
      const torrentFile = Buffer.from('temporary');
      const torrent = { infoHash: hash, torrentFile } as unknown as Torrent;
      (mockedTorrentInstance as unknown as { torrents: Torrent[] }).torrents = [];
      mockedTorrentInstance.add.mockImplementation((_link, _options, callback) => {
        callback?.(torrent);
        return torrent;
      });

      await expect(
        service.getSourceMetadataFile(`magnet:?xt=urn:btih:${hash}`, hash, 5000)
      ).resolves.toBe(torrentFile);
      expect(mockedTorrentInstance.remove).toHaveBeenCalledWith(hash, { destroyStore: true });
    });
  });

  describe('stream cancellation', () => {
    it('releases stream activity once when cancellation interrupts a pending piece read', async () => {
      const { service, mockStorageService } = setupTest();
      const webtorrent = service.client as unknown as {
        ready: boolean;
        add: jest.Mock;
        torrents: unknown[];
      };
      const storage = {
        id: 1,
        location: '/tmp/test-downloads/movie',
        downloadedPieces: new Uint8Array(0),
        size: 10,
      };
      webtorrent.ready = true;
      mockStorageService.withSourceLock.mockImplementation(async (_sourceId, operation) =>
        operation()
      );
      mockStorageService.createStorage.mockResolvedValue(storage as never);
      mockStorageService.getStorageBySource.mockResolvedValue(storage as never);
      mockStorageService.setPlaybackActive.mockResolvedValue(true);

      const file = {
        name: 'movie.mkv',
        path: 'movie.mkv',
        length: 10,
        offset: 0,
        select: jest.fn(),
      };
      const torrent = {
        infoHash: 'a'.repeat(40),
        name: 'movie',
        bitfield: undefined,
        pieces: new Array(1),
        ready: true,
        pieceLength: 10,
        length: 10,
        files: [file],
        on: jest.fn(),
        once: jest.fn(),
        removeListener: jest.fn(),
        off: jest.fn(),
      };
      webtorrent.torrents = [];
      webtorrent.add.mockImplementation((_input, _options, callback) => {
        queueMicrotask(() => callback?.(torrent as never));
        return torrent as never;
      });

      const response = await service.streamFile(
        target({
          id: 1,
          size: 10,
          hash: 'a'.repeat(40),
          magnetLink: 'magnet:?xt=urn:btih:test',
          file: null,
        })
      );
      const cancel = response.body!.cancel();
      await cancel;

      expect(service.hasActivePlayback()).toBe(false);
      expect(service.isPlaybackActive(1)).toBe(false);
      expect(mockStorageService.setPlaybackActive).toHaveBeenNthCalledWith(1, 1, true);
      expect(mockStorageService.setPlaybackActive).toHaveBeenNthCalledWith(2, 1, false);
    });

    it('keeps an active response readable after seeding expires and removes the torrent without its files', async () => {
      const { service, mockStorageService } = setupTest();
      const webtorrent = service.client as unknown as {
        ready: boolean;
        torrents: Torrent[];
        remove: jest.Mock;
      };
      webtorrent.ready = true;
      const layout: EncryptedStorageLayout = {
        storeName: 'movie - abcdef12',
        filenameSalt: 'download-a',
        pieceLength: 4,
        files: [{ path: 'movie.mkv', offset: 0, length: 8 }],
      };
      const storage = createMockStorage({
        location: '/tmp/test-downloads/movie',
        size: 8,
        videoCompletedAt: new Date(),
        localOnly: false,
        encryptedLayout: layout,
      });
      const file = { path: 'movie.mkv', select: jest.fn() };
      const torrent = {
        path: storage.location,
        files: [file],
        bitfield: { get: () => true },
        destroyed: false,
      } as unknown as Torrent;
      webtorrent.torrents = [torrent];
      webtorrent.remove.mockResolvedValue(undefined);
      mockStorageService.withSourceLock.mockImplementation(async (_id, operation) => operation());
      mockStorageService.setPlaybackActive.mockResolvedValue(true);
      mockStorageService.getStorageBySource.mockResolvedValue(storage);
      mockStorageService.detachCompletedStorage.mockImplementation(async (_id, detach) => {
        await detach();
        return { ...storage, localOnly: true };
      });
      jest.spyOn(service, 'startDownload').mockResolvedValue({
        sourceId: storage.sourceId,
        torrent,
        storage,
        layout,
        startTime: new Date(),
      });

      const response = await service.streamFile(target({ id: storage.sourceId, size: 8 }));
      const reader = response.body!.getReader();
      const first = await reader.read();
      const detach = (
        service as unknown as {
          detachCompletedTorrent: (sourceId: number) => Promise<void>;
        }
      ).detachCompletedTorrent;
      await detach.call(service, storage.sourceId);
      const second = await reader.read();
      const end = await reader.read();

      expect(Buffer.concat([Buffer.from(first.value!), Buffer.from(second.value!)])).toHaveLength(
        8
      );
      expect(end.done).toBe(true);
      expect(webtorrent.remove).toHaveBeenCalledWith(torrent, { destroyStore: false });
      expect(service.hasActivePlayback()).toBe(false);
    });

    it('caps a partial range inside an encrypted piece', async () => {
      const { service, mockStorageService } = setupTest();
      const webtorrent = service.client as unknown as {
        ready: boolean;
        torrents: Torrent[];
        remove: jest.Mock;
      };
      webtorrent.ready = true;
      const layout: EncryptedStorageLayout = {
        storeName: 'movie - abcdef12',
        filenameSalt: 'download-a',
        pieceLength: 4,
        files: [{ path: 'movie.mkv', offset: 0, length: 8 }],
      };
      const storage = createMockStorage({
        location: '/tmp/test-downloads/movie',
        size: 8,
        videoCompletedAt: new Date(),
        localOnly: false,
        encryptedLayout: layout,
      });
      const file = { path: 'movie.mkv', select: jest.fn() };
      const torrent = {
        path: storage.location,
        files: [file],
        bitfield: { get: () => true },
        destroyed: false,
      } as unknown as Torrent;
      webtorrent.torrents = [torrent];
      webtorrent.remove.mockResolvedValue(undefined);
      mockStorageService.withSourceLock.mockImplementation(async (_id, operation) => operation());
      mockStorageService.setPlaybackActive.mockResolvedValue(true);
      mockStorageService.getStorageBySource.mockResolvedValue(storage);
      mockStorageService.detachCompletedStorage.mockImplementation(async (_id, detach) => {
        await detach();
        return { ...storage, localOnly: true };
      });
      jest.spyOn(service, 'startDownload').mockResolvedValue({
        sourceId: storage.sourceId,
        torrent,
        storage,
        layout,
        startTime: new Date(),
      });

      const response = await service.streamFile(
        target({ id: storage.sourceId, size: 8 }),
        'bytes=0-2'
      );
      expect(response.headers.get('Content-Length')).toBe('3');
      expect((await response.arrayBuffer()).byteLength).toBe(3);
      expect(service.hasActivePlayback()).toBe(false);
    });

    it('does not reattach a torrent when requested subtitles are already complete', async () => {
      const { service, mockStorageService } = setupTest();
      const layout: EncryptedStorageLayout = {
        storeName: 'movie',
        filenameSalt: 'salt',
        pieceLength: 4,
        files: [
          { path: 'movie.mkv', offset: 0, length: 8 },
          { path: 'movie.en.srt', offset: 8, length: 4 },
        ],
      };
      const storage = createMockStorage({
        sourceId: 12,
        encryptedLayout: layout,
        downloadedPieces: Uint8Array.of(0b00100000),
        localOnly: true,
        videoCompletedAt: new Date(),
      });
      mockStorageService.getStorageBySource.mockResolvedValue(storage);
      const startDownload = jest.spyOn(service, 'startDownload');

      await service.prepareSubtitleFiles(target({ id: 12, hash: 'a'.repeat(40), size: 12 }), [
        'movie.en.srt',
      ]);

      expect(startDownload).not.toHaveBeenCalled();
      // The sidecar still follows the video's retention.
      expect(mockStorageService.copyClaims).toHaveBeenCalledWith(12, 'movie.mkv', ['movie.en.srt']);
    });

    it('selects the requested subtitle and waits for its verified pieces even when the video is complete', async () => {
      const { service, mockStorageService } = setupTest();
      (service.client as unknown as { ready: boolean }).ready = true;
      const layout: EncryptedStorageLayout = {
        storeName: 'movie',
        filenameSalt: 'salt',
        pieceLength: 4,
        files: [
          { path: 'movie.mkv', offset: 0, length: 8 },
          { path: 'movie.en.srt', offset: 8, length: 4 },
        ],
      };
      const storage = createMockStorage({
        location: '/tmp/test-downloads/movie',
        size: 12,
        videoCompletedAt: new Date(),
        localOnly: false,
        encryptedLayout: layout,
      });
      let subtitleVerified = false;
      const subtitleFile = { path: 'movie.en.srt', select: jest.fn() };
      const torrent = Object.assign(new EventEmitter(), {
        files: [subtitleFile],
        bitfield: { get: (piece: number) => piece < 2 || subtitleVerified },
        destroyed: false,
      }) as unknown as Torrent;
      const startDownload = jest.spyOn(service, 'startDownload').mockResolvedValue({
        sourceId: storage.sourceId,
        torrent,
        storage,
        layout,
        startTime: new Date(),
      });
      mockStorageService.withSourceLock.mockImplementation(async (_id, operation) => operation());
      mockStorageService.setPlaybackActive.mockResolvedValue(true);
      const subtitle = target({ id: storage.sourceId, size: 12 }, 'movie.en.srt');
      const response = await service.streamFile(subtitle);
      // Reading claims the sidecar for playback, which selects it at playback priority.
      expect(startDownload).toHaveBeenCalledWith(subtitle, {
        kind: 'playback',
        ownerKey: 'stream',
      });
      expect(response.headers.get('Content-Length')).toBe('4');
      let finished = false;
      const body = response.arrayBuffer().then(bytes => {
        finished = true;
        return bytes;
      });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(finished).toBe(false);
      subtitleVerified = true;
      torrent.emit('verified', 2);
      expect((await body).byteLength).toBe(4);
      expect(service.hasActivePlayback()).toBe(false);
      await expect(
        service.streamFile(target({ id: storage.sourceId, size: 12 }, '../../unrelated.srt'))
      ).rejects.toThrow('Requested torrent file is unavailable');
    });

    it('plays a detached encrypted source without adding it back to WebTorrent', async () => {
      const { service, mockStorageService } = setupTest();
      const webtorrent = service.client as unknown as {
        ready: boolean;
        torrents: Torrent[];
        add: jest.Mock;
      };
      webtorrent.ready = true;
      webtorrent.torrents = [];
      const layout: EncryptedStorageLayout = {
        storeName: 'movie - abcdef12',
        filenameSalt: 'download-a',
        pieceLength: 4,
        files: [{ path: 'movie.mkv', offset: 0, length: 8 }],
      };
      const storage = createMockStorage({
        location: '/tmp/test-downloads/movie',
        size: 8,
        videoCompletedAt: new Date(Date.now() - 60 * 60_000),
        localOnly: true,
        encryptedLayout: layout,
      });
      mockStorageService.createStorage.mockResolvedValue(storage);
      mockStorageService.getStorageBySource.mockResolvedValue(storage);
      mockStorageService.getFiles.mockResolvedValue([
        { path: 'movie.mkv', completedAt: new Date() } as never,
      ]);
      mockStorageService.withSourceLock.mockImplementation(async (_id, operation) => operation());
      mockStorageService.setPlaybackActive.mockResolvedValue(true);

      const response = await service.streamFile(
        target({ id: storage.sourceId, size: 8, hash: storage.contentSource.hash })
      );
      const media = await response.arrayBuffer();

      expect(media.byteLength).toBe(8);
      expect(webtorrent.add).not.toHaveBeenCalled();
    });
  });

  describe('source promotion', () => {
    it('starts the watched download with a reservation and marks the selected file accessed', async () => {
      const { service, mockStorageService } = setupTest();
      const file = { name: 'movie.mkv', path: 'movie.mkv', length: 10, select: jest.fn() };
      const download = { torrent: { files: [file] } };
      const startDownload = jest
        .spyOn(service, 'startDownload')
        .mockResolvedValue(download as never);
      const movie = target({
        id: 12,
        size: 100,
        hash: 'a'.repeat(40),
        magnetLink: 'magnet:?xt=urn:btih:test',
      });

      await expect(service.promoteSource(movie, 'user:1:m:12')).resolves.toBe(true);

      expect(startDownload).toHaveBeenCalledWith(movie, {
        kind: 'watched',
        ownerKey: 'user:1:m:12',
      });
      expect(mockStorageService.reserveStorage).not.toHaveBeenCalled();
      expect(mockStorageService.markAsAccessed).toHaveBeenCalledWith(12);
    });

    it('claims a warmup prefix for the lease and reports its piece range', async () => {
      const { service } = setupTest();
      const torrent = {
        files: [{ path: 'movie.mkv', offset: 0, length: 10 }],
        pieces: new Array(5),
        pieceLength: 2,
        length: 10,
      };
      const startDownload = jest.spyOn(service, 'startDownload').mockResolvedValue({
        torrent,
        layout: { pieceLength: 2, files: [{ path: 'movie.mkv', offset: 0, length: 10 }] },
      } as never);
      const movie = target({ id: 12, size: 10 });

      await expect(service.warmSource(movie, 4, 'lease-a')).resolves.toEqual({
        sourceId: 12,
        filePath: 'movie.mkv',
        targetBytes: 4,
        firstPiece: 0,
        lastPiece: 1,
      });
      expect(startDownload).toHaveBeenCalledWith(
        movie,
        { kind: 'warmup', ownerKey: 'lease-a', rangeEnd: 4 },
        { reservedBytes: 4 }
      );
    });
  });

  describe('claim-driven selection', () => {
    const claim = (path: string, kind: string, ownerKey: string, rangeEnd: number | null = null) =>
      ({ path, kind, ownerKey, rangeEnd, expiresAt: null }) as never;

    const setupSelection = () => {
      const setup = setupTest();
      const files = ['Show.S01E01.mkv', 'Show.S01E02.mkv'].map((path, index) => ({
        path,
        offset: index * 8,
        length: 8,
        select: jest.fn(),
        deselect: jest.fn(),
      }));
      const torrent = {
        path: '/tmp/test-downloads/pack',
        files,
        pieces: new Array(4),
        pieceLength: 4,
        select: jest.fn(),
        deselect: jest.fn(),
      } as unknown as Torrent;
      (setup.service.client as unknown as { torrents: Torrent[] }).torrents = [torrent];
      setup.mockStorageService.getStorageBySource.mockResolvedValue(
        createMockStorage({ sourceId: 7, location: '/tmp/test-downloads/pack' })
      );
      const reconcile = (
        setup.service as unknown as { reconcileSelection: (sourceId: number) => Promise<void> }
      ).reconcileSelection.bind(setup.service);
      return { ...setup, files, torrent, reconcile };
    };

    it('selects whole files at the strongest claim priority and prefixes as piece ranges', async () => {
      const { mockStorageService, files, torrent, reconcile } = setupSelection();
      mockStorageService.getLiveClaims.mockResolvedValue([
        claim('Show.S01E01.mkv', 'watched', 'user:1'),
        claim('Show.S01E01.mkv', 'playback', 'stream'),
        claim('Show.S01E02.mkv', 'warmup', 'lease', 5),
      ]);

      await reconcile(7);

      expect(files[0].select).toHaveBeenCalledWith(10);
      expect(files[1].select).not.toHaveBeenCalled();
      expect(torrent.select).toHaveBeenCalledWith(2, 3, 1);
    });

    it('keeps a file selected while another owner still claims it', async () => {
      const { mockStorageService, files, reconcile } = setupSelection();
      mockStorageService.getLiveClaims.mockResolvedValue([
        claim('Show.S01E01.mkv', 'watched', 'user:1'),
        claim('Show.S01E02.mkv', 'prefetch', 'next:2'),
      ]);
      await reconcile(7);

      // user:1 releases episode 1; next:2 still wants episode 2.
      mockStorageService.getLiveClaims.mockResolvedValue([
        claim('Show.S01E02.mkv', 'prefetch', 'next:2'),
      ]);
      files.forEach(file => file.select.mockClear());
      await reconcile(7);

      expect(files[0].deselect).toHaveBeenCalled();
      expect(files[0].select).not.toHaveBeenCalled();
      expect(files[1].select).toHaveBeenCalledWith(1);
    });

    it('keeps nothing selected while the source is paused', async () => {
      const { service, mockStorageService, files, torrent, reconcile } = setupSelection();
      mockStorageService.getLiveClaims.mockResolvedValue([
        claim('Show.S01E01.mkv', 'watchlist', 'watchlist:tv:1'),
      ]);
      await service.pauseDownload(7);
      await reconcile(7);

      expect(files[0].select).not.toHaveBeenCalled();
      expect(torrent.deselect).toHaveBeenCalledWith(0, 3);

      await service.resumeDownload(7);
      expect(files[0].select).toHaveBeenCalledWith(0);
    });

    it('stops a warmup by releasing only its warmup claims', async () => {
      const { service, mockStorageService } = setupSelection();

      await expect(service.pauseSource(7)).resolves.toBe(true);

      expect(mockStorageService.releaseClaims).toHaveBeenCalledWith(7, { kind: 'warmup' });
    });

    it('sweeps expired claims and reselects the affected sources', async () => {
      const { service, mockStorageService, files } = setupSelection();
      mockStorageService.deleteClaims.mockResolvedValue([7]);

      await service.sweepExpiredClaims();

      expect(mockStorageService.deleteClaims).toHaveBeenCalledWith({ expiredAt: expect.any(Date) });
      expect(files[0].deselect).toHaveBeenCalled();
      expect(files[0].select).not.toHaveBeenCalled();
    });
  });

  describe('download tracking and allocation reconciliation', () => {
    it('starts completion from the selected video pieces even when auxiliary torrent pieces are missing', async () => {
      const { service, mockStorageService } = setupTest();
      mockStorageService.getClaimedPaths.mockResolvedValue(['movie.mkv']);
      mockStorageService.getFiles.mockResolvedValue([
        { path: 'movie.mkv', completedAt: null },
        { path: 'extras.nfo', completedAt: null },
      ] as never);
      const completedStorage = createMockStorage({
        videoCompletedAt: new Date(),
        localOnly: false,
      });
      mockStorageService.markVideoComplete.mockResolvedValue(completedStorage);
      const schedule = jest.spyOn(
        service as unknown as { scheduleSeedExpiry: (storage: Storage) => void },
        'scheduleSeedExpiry'
      );
      const layout = {
        storeName: 'movie - abcdef12',
        filenameSalt: 'download-a'.repeat(5),
        pieceLength: 4,
        files: [
          { path: 'movie.mkv', offset: 0, length: 8 },
          { path: 'extras.nfo', offset: 8, length: 4 },
        ],
      };
      const torrent = {
        bitfield: { get: (index: number) => index < 2, buffer: Uint8Array.of(0b11000000) },
      };
      const recordCompletion = (
        service as unknown as {
          recordCompletion: (
            torrent: Torrent,
            id: number,
            layout: EncryptedStorageLayout
          ) => Promise<void>;
        }
      ).recordCompletion;

      await recordCompletion.call(service, torrent as never, 42, layout);

      expect(mockStorageService.markFilesComplete).toHaveBeenCalledWith(42, ['movie.mkv']);
      expect(mockStorageService.markVideoComplete).toHaveBeenCalledWith(42, layout);
      expect(schedule).toHaveBeenCalledWith(completedStorage);
    });

    it('detaches at the configured deadline and preserves a completed storage row', async () => {
      const { service, mockStorageService } = setupTest();
      jest.useFakeTimers();
      try {
        const completionTime = new Date(Date.now());
        let storage = createMockStorage({ videoCompletedAt: completionTime, localOnly: false });
        mockStorageService.getStorageBySource.mockImplementation(async () => storage);
        mockStorageService.detachCompletedStorage.mockImplementation(async (_id, detach) => {
          await detach();
          storage = { ...storage, localOnly: true };
          return storage;
        });
        const torrent = { path: storage.location } as Torrent;
        (mockedTorrentInstance as unknown as { torrents: Torrent[] }).torrents = [torrent];
        mockedTorrentInstance.remove.mockResolvedValue(undefined);
        const schedule = (service as unknown as { scheduleSeedExpiry: (item: Storage) => void })
          .scheduleSeedExpiry;

        schedule.call(service, storage);
        await jest.advanceTimersByTimeAsync(3_599_999);
        expect(mockStorageService.detachCompletedStorage).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(1);

        expect(mockStorageService.detachCompletedStorage).toHaveBeenCalledWith(
          storage.sourceId,
          expect.any(Function)
        );
        expect(storage.localOnly).toBe(true);
        expect(mockedTorrentInstance.remove).toHaveBeenCalledWith(torrent, {
          destroyStore: false,
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('detaches immediately when the configured seeding duration is zero', async () => {
      const { service, mockStorageService } = setupTest({ seedDurationSeconds: 0 });
      jest.useFakeTimers();
      try {
        const storage = createMockStorage({ videoCompletedAt: new Date(), localOnly: false });
        mockStorageService.getStorageBySource.mockResolvedValue(storage);
        mockStorageService.detachCompletedStorage.mockImplementation(async (_id, detach) => {
          await detach();
          return { ...storage, localOnly: true };
        });
        (mockedTorrentInstance as unknown as { torrents: Torrent[] }).torrents = [
          { path: storage.location } as Torrent,
        ];
        mockedTorrentInstance.remove.mockResolvedValue(undefined);

        const schedule = (service as unknown as { scheduleSeedExpiry: (item: Storage) => void })
          .scheduleSeedExpiry;
        schedule.call(service, storage);
        await jest.advanceTimersByTimeAsync(0);

        expect(mockedTorrentInstance.remove).toHaveBeenCalledWith(expect.any(Object), {
          destroyStore: false,
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('recalculates pending deadlines when the configuration reloads', async () => {
      const { service, configService, mockStorageService } = setupTest();
      jest.useFakeTimers();
      try {
        const storage = createMockStorage({ videoCompletedAt: new Date(), localOnly: false });
        mockStorageService.getStoragesWithCompletion.mockResolvedValue([storage]);
        mockStorageService.getStorageBySource.mockResolvedValue(storage);
        mockStorageService.detachCompletedStorage.mockImplementation(async (_id, detach) => {
          await detach();
          return { ...storage, localOnly: true };
        });
        (mockedTorrentInstance as unknown as { torrents: Torrent[] }).torrents = [
          { path: storage.location } as Torrent,
        ];
        mockedTorrentInstance.remove.mockResolvedValue(undefined);
        jest
          .spyOn(service as unknown as { init: () => Promise<void> }, 'init')
          .mockResolvedValue(undefined);

        await service.reload();
        configService.setSeedDurationSeconds(0);
        await service.reload();
        await jest.advanceTimersByTimeAsync(0);

        expect(mockStorageService.detachCompletedStorage).toHaveBeenCalledWith(
          storage.sourceId,
          expect.any(Function)
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('restores seeding after restart only while the saved deadline remains', async () => {
      const { service, mockStorageService } = setupTest();
      mockStorageService.withSourceLock.mockImplementation(async (_id, operation) => operation());
      (mockedTorrentInstance as unknown as { torrents: Torrent[] }).torrents = [];
      const layout: EncryptedStorageLayout = {
        storeName: 'movie - abcdef12',
        filenameSalt: 'download-abc',
        pieceLength: 4,
        files: [{ path: 'movie.mkv', offset: 0, length: 8 }],
      };
      const activeStorage = createMockStorage({
        videoCompletedAt: new Date(Date.now() - 30 * 60_000),
        localOnly: false,
        encryptedLayout: layout,
      });
      mockStorageService.getLiveClaims.mockResolvedValue([
        { path: 'movie.mkv', kind: 'watched', ownerKey: 'user:1', rangeEnd: null } as never,
      ]);
      mockStorageService.getStoragesWithCompletion.mockResolvedValue([activeStorage]);
      mockStorageService.getStorageBySource.mockResolvedValue(activeStorage);
      const file = { path: 'movie.mkv', select: jest.fn(), deselect: jest.fn() };
      const torrent = {
        path: activeStorage.location,
        files: [file],
        bitfield: { get: () => true },
        pieces: new Array(2),
        pieceLength: 4,
        length: 8,
        on: jest.fn(),
        once: jest.fn(),
        removeListener: jest.fn(),
        deselect: jest.fn(),
      } as unknown as Torrent;
      const addTorrent = jest
        .spyOn(
          service as unknown as { addTorrentWithLock: (...args: never[]) => Promise<Torrent> },
          'addTorrentWithLock'
        )
        .mockImplementation(async () => {
          (mockedTorrentInstance as unknown as { torrents: Torrent[] }).torrents = [torrent];
          return torrent;
        });
      const restore = (service as unknown as { restoreCompletedDownloads: () => Promise<void> })
        .restoreCompletedDownloads;

      await restore.call(service);

      expect(addTorrent).toHaveBeenCalledWith(activeStorage.contentSource, activeStorage);
      expect(file.select).toHaveBeenCalledTimes(1);

      const expiredStorage = createMockStorage({
        videoCompletedAt: new Date(Date.now() - 2 * 60 * 60_000),
        localOnly: false,
        encryptedLayout: layout,
      });
      mockStorageService.getStoragesWithCompletion.mockResolvedValue([expiredStorage]);
      mockStorageService.getStorageBySource.mockResolvedValue(expiredStorage);
      addTorrent.mockClear();
      await restore.call(service);

      expect(addTorrent).not.toHaveBeenCalled();
      expect(mockStorageService.detachCompletedStorage).toHaveBeenCalledWith(
        expiredStorage.sourceId,
        expect.any(Function)
      );
    });

    it('retries detaching an expired source when startup removal fails', async () => {
      const { service, mockStorageService } = setupTest();
      const storage = createMockStorage({
        videoCompletedAt: new Date(Date.now() - 2 * 60 * 60_000),
        localOnly: false,
      });
      mockStorageService.getStoragesWithCompletion.mockResolvedValue([storage]);
      const internals = service as unknown as {
        detachCompletedTorrent: (sourceId: number) => Promise<void>;
        scheduleDetachRetry: (sourceId: number) => void;
        restoreCompletedDownloads: () => Promise<void>;
      };
      const detach = jest
        .spyOn(internals, 'detachCompletedTorrent')
        .mockRejectedValue(new Error('remove failed'));
      const retry = jest.spyOn(internals, 'scheduleDetachRetry');

      await internals.restoreCompletedDownloads();

      expect(detach).toHaveBeenCalledWith(storage.sourceId);
      expect(retry).toHaveBeenCalledWith(storage.sourceId);
    });

    it('drops its claim when an unknown layout turns out not to contain the file', async () => {
      const { service, mockStorageService } = setupTest();
      const torrent = {
        infoHash: 'b'.repeat(40),
        name: 'pack',
        files: [{ name: 'Show.S01E01.mkv', path: 'Show.S01E01.mkv', length: 10, offset: 0 }],
        pieces: new Array(1),
        pieceLength: 10,
        length: 10,
        on: jest.fn(),
      } as unknown as Torrent;
      const storage = { location: '/tmp/test-downloads/pack', downloadedPieces: new Uint8Array(0) };
      mockStorageService.createStorage.mockResolvedValue(storage as never);
      mockStorageService.getStorageBySource.mockResolvedValue(storage as never);
      jest
        .spyOn(
          service as unknown as { addTorrent: (...args: never[]) => Promise<Torrent> },
          'addTorrent'
        )
        .mockResolvedValue(torrent);
      const episode = target(
        { id: 3, size: 10, hash: 'b'.repeat(40), magnetLink: 'magnet:?xt=urn:btih:pack' },
        'Show.S01E02.mkv'
      );

      await expect(service.startDownload(episode, WATCHED)).rejects.toThrow(
        'Requested file is not part of this source'
      );
      expect(mockStorageService.releaseClaims).toHaveBeenCalledWith(3, {
        kind: 'watched',
        ownerKey: 'user:test',
        path: 'Show.S01E02.mkv',
      });
      expect(mockStorageService.updateEncryptedLayout).not.toHaveBeenCalled();
    });

    it('completes a source even if a stray claim names a file it does not contain', async () => {
      const { service, mockStorageService } = setupTest();
      mockStorageService.getClaimedPaths.mockResolvedValue(['movie.mkv', 'missing.mkv']);
      mockStorageService.getFiles.mockResolvedValue([
        { path: 'movie.mkv', completedAt: null },
      ] as never);
      mockStorageService.markVideoComplete.mockResolvedValue(null);
      const layout = {
        storeName: 'movie',
        filenameSalt: 'salt',
        pieceLength: 4,
        files: [{ path: 'movie.mkv', offset: 0, length: 8 }],
      };
      const torrent = { bitfield: { buffer: Uint8Array.of(0b11000000) } };
      const recordCompletion = (
        service as unknown as {
          recordCompletion: (
            torrent: Torrent,
            id: number,
            layout: EncryptedStorageLayout
          ) => Promise<void>;
        }
      ).recordCompletion;

      await recordCompletion.call(service, torrent as never, 9, layout);

      expect(mockStorageService.markVideoComplete).toHaveBeenCalledWith(9, layout);
    });

    it('uses the runtime WebTorrent piece list for persisted layout', async () => {
      const { service, mockStorageService } = setupTest();
      const sourceHash = 'ABCDEF1234'.padEnd(40, 'A');
      const torrent = {
        infoHash: sourceHash.toLowerCase(),
        name: 'movie',
        files: [{ name: 'movie.mkv', path: 'movie.mkv', length: 50, offset: 0 }],
        pieces: new Array(5),
        bitfield: undefined,
        pieceLength: 10,
        length: 50,
        on: jest.fn(),
      } as unknown as Torrent;
      mockStorageService.createStorage.mockResolvedValue({
        location: '/tmp/test-downloads/movie',
        downloadedPieces: new Uint8Array(0),
      } as never);
      mockStorageService.getStorageBySource.mockResolvedValue({
        location: '/tmp/test-downloads/movie',
        downloadedPieces: new Uint8Array(0),
      } as never);
      mockStorageService.getClaimedPaths.mockResolvedValue(['movie.mkv']);
      jest
        .spyOn(
          service as unknown as { addTorrent: (...args: never[]) => Promise<Torrent> },
          'addTorrent'
        )
        .mockResolvedValue(torrent);

      await service.startDownload(
        target({
          id: 1,
          size: 50,
          hash: sourceHash,
          magnetLink: 'magnet:?xt=urn:btih:test',
        }),
        WATCHED
      );

      expect(mockStorageService.updateDownloadProgress).toHaveBeenCalledWith(
        expect.objectContaining({ totalPieces: 5 })
      );
      expect(mockStorageService.updateTorrentLayout).toHaveBeenCalledWith(1, 5, 10, 50, 50);
      expect(mockStorageService.updateEncryptedLayout).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ filenameSalt: `download-${sourceHash}` })
      );
    });

    it('repairs a completed local layout to use the exact source hash before skipping WebTorrent', async () => {
      const { service, mockStorageService } = setupTest();
      const sourceHash = 'ABCDEF1234'.padEnd(40, 'A');
      const layout: EncryptedStorageLayout = {
        storeName: 'movie - abcdef12',
        filenameSalt: `download-${sourceHash.toLowerCase()}`,
        pieceLength: 4,
        files: [{ path: 'movie.mkv', offset: 0, length: 4 }],
      };
      const storage = createMockStorage({
        location: '/tmp/test-downloads/local-movie',
        videoCompletedAt: new Date(),
        localOnly: true,
        encryptedLayout: layout,
      });
      mockStorageService.createStorage.mockResolvedValue(storage);
      mockStorageService.getStorageBySource.mockResolvedValue(storage);
      mockStorageService.getFiles.mockResolvedValue([
        { path: 'movie.mkv', completedAt: new Date() } as never,
      ]);

      const result = await service.startDownload(
        target({
          id: storage.sourceId,
          hash: sourceHash,
          magnetLink: `magnet:?xt=urn:btih:${sourceHash}`,
          size: 4,
        }),
        WATCHED
      );

      expect(result.torrent).toBeNull();
      expect(result.layout?.filenameSalt).toBe(`download-${sourceHash}`);
      expect(mockStorageService.updateEncryptedLayout).toHaveBeenCalledWith(
        storage.sourceId,
        expect.objectContaining({ filenameSalt: `download-${sourceHash}` })
      );
    });

    it('records completion when the selected video is already verified on open', async () => {
      const { service, mockStorageService } = setupTest();
      const sourceId = 44;
      const hash = 'a'.repeat(40);
      const storage = createMockStorage({
        sourceId: sourceId,
        location: '/tmp/test-downloads/completed-movie',
        size: 8,
      });
      mockStorageService.getClaimedPaths.mockResolvedValue(['movie.mkv']);
      mockStorageService.getFiles.mockResolvedValue([
        { path: 'movie.mkv', completedAt: null } as never,
      ]);
      mockStorageService.createStorage.mockResolvedValue(storage);
      mockStorageService.getStorageBySource.mockResolvedValue(storage);
      mockStorageService.markVideoComplete.mockResolvedValue(
        createMockStorage({ videoCompletedAt: new Date(), localOnly: false })
      );
      const torrent = {
        infoHash: hash,
        name: 'movie',
        files: [{ name: 'movie.mkv', path: 'movie.mkv', offset: 0, length: 8, select: jest.fn() }],
        pieces: new Array(2),
        bitfield: { get: () => true, buffer: Uint8Array.of(0b11000000) },
        pieceLength: 4,
        length: 8,
        on: jest.fn(),
      } as unknown as Torrent;
      jest
        .spyOn(
          service as unknown as { addTorrent: (...args: never[]) => Promise<Torrent> },
          'addTorrent'
        )
        .mockResolvedValue(torrent);

      await service.startDownload(
        target({
          id: sourceId,
          size: 8,
          hash,
          magnetLink: `magnet:?xt=urn:btih:${hash}`,
        }),
        WATCHED
      );

      expect(mockStorageService.markVideoComplete).toHaveBeenCalledWith(
        sourceId,
        expect.objectContaining({})
      );
    });

    it('shares an in-flight torrent start for concurrent requests of the same hash', async () => {
      const { service, mockStorageService } = setupTest();
      const torrent = {
        infoHash: 'a'.repeat(40),
        name: 'movie',
        files: [{ name: 'movie.mkv', path: 'movie.mkv', length: 10, offset: 0 }],
        pieces: new Array(1),
        bitfield: undefined,
        pieceLength: 10,
        length: 10,
        on: jest.fn(),
      } as unknown as Torrent;
      mockStorageService.createStorage.mockResolvedValue({
        location: '/tmp/test-downloads/movie',
        downloadedPieces: new Uint8Array(0),
      } as never);
      mockStorageService.getStorageBySource.mockResolvedValue({
        location: '/tmp/test-downloads/movie',
        downloadedPieces: new Uint8Array(0),
      } as never);
      let resolveStart!: (value: Torrent) => void;
      const addTorrent = jest
        .spyOn(
          service as unknown as { addTorrent: (...args: never[]) => Promise<Torrent> },
          'addTorrent'
        )
        .mockImplementation(() => new Promise(resolve => (resolveStart = resolve)));
      const source = target({
        id: 1,
        size: 10,
        hash: 'a'.repeat(40),
        magnetLink: 'magnet:?xt=urn:btih:test',
      });

      const first = service.startDownload(source, WATCHED);
      const second = service.startDownload(source, WATCHED);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(addTorrent).toHaveBeenCalledTimes(1);

      resolveStart(torrent);
      await Promise.all([first, second]);
      expect(addTorrent).toHaveBeenCalledTimes(1);
    });

    it('sets up bitfield tracking once when a torrent is reused', async () => {
      const { service, mockStorageService } = setupTest();
      const torrent = {
        infoHash: 'a'.repeat(40),
        name: 'movie',
        files: [{ name: 'movie.mkv', path: 'movie.mkv', length: 10, offset: 0 }],
        bitfield: undefined,
        pieces: new Array(1),
        pieceLength: 10,
        length: 10,
        on: jest.fn(),
      } as unknown as Torrent;
      mockStorageService.createStorage.mockResolvedValue({
        location: '/tmp/test-downloads/movie',
        downloadedPieces: new Uint8Array(0),
      } as never);
      mockStorageService.getStorageBySource.mockResolvedValue({
        location: '/tmp/test-downloads/movie',
        downloadedPieces: new Uint8Array(0),
      } as never);
      jest
        .spyOn(
          service as unknown as { addTorrent: (...args: never[]) => Promise<Torrent> },
          'addTorrent'
        )
        .mockResolvedValue(torrent);
      const source = target({
        id: 1,
        size: 10,
        hash: 'a'.repeat(40),
        magnetLink: 'magnet:?xt=urn:btih:test',
      });

      await service.startDownload(source, WATCHED);
      await service.startDownload(source, WATCHED);

      expect(torrent.on).toHaveBeenCalledTimes(2);
      expect(torrent.on).toHaveBeenNthCalledWith(1, 'verified', expect.any(Function));
      expect(torrent.on).toHaveBeenNthCalledWith(2, 'done', expect.any(Function));
    });

    it('tracks each source when different sources reuse one torrent', async () => {
      const { service, mockStorageService } = setupTest();
      const torrent = {
        infoHash: 'a'.repeat(40),
        name: 'movie',
        files: [{ name: 'movie.mkv', path: 'movie.mkv', length: 10, offset: 0 }],
        bitfield: undefined,
        pieces: new Array(1),
        pieceLength: 10,
        length: 10,
        on: jest.fn(),
      } as unknown as Torrent;
      mockStorageService.createStorage.mockResolvedValue({
        location: '/tmp/test-downloads/movie',
        downloadedPieces: new Uint8Array(0),
      } as never);
      mockStorageService.getStorageBySource.mockResolvedValue({
        location: '/tmp/test-downloads/movie',
        downloadedPieces: new Uint8Array(0),
      } as never);
      jest
        .spyOn(
          service as unknown as { addTorrent: (...args: never[]) => Promise<Torrent> },
          'addTorrent'
        )
        .mockResolvedValue(torrent);
      const source = (id: number) =>
        target({
          id,
          size: 10,
          hash: 'a'.repeat(40),
          magnetLink: 'magnet:?xt=urn:btih:test',
        });

      await service.startDownload(source(1), WATCHED);
      await service.startDownload(source(2), WATCHED);

      expect(torrent.on).toHaveBeenCalledTimes(4);
      expect(torrent.on).toHaveBeenNthCalledWith(1, 'verified', expect.any(Function));
      expect(torrent.on).toHaveBeenNthCalledWith(2, 'done', expect.any(Function));
      expect(torrent.on).toHaveBeenNthCalledWith(3, 'verified', expect.any(Function));
      expect(torrent.on).toHaveBeenNthCalledWith(4, 'done', expect.any(Function));

      mockStorageService.updateDownloadProgress.mockClear();
      const verifiedHandlers = (torrent.on as jest.Mock).mock.calls
        .filter(([event]) => event === 'verified')
        .map(([, handler]) => handler as () => Promise<void>);
      await Promise.all(verifiedHandlers.map(handler => handler()));

      expect(mockStorageService.updateDownloadProgress).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: 1 })
      );
      expect(mockStorageService.updateDownloadProgress).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: 2 })
      );
    });

    it('writes the bitfield under the source lock from a fresh snapshot, coalescing verifies', async () => {
      const { service, mockStorageService } = setupTest();
      const bitfield = { buffer: new Uint8Array([0b11000000]) };
      const torrent = {
        infoHash: 'a'.repeat(40),
        name: 'movie',
        files: [{ name: 'movie.mkv', path: 'movie.mkv', length: 10, offset: 0 }],
        bitfield,
        pieces: new Array(2),
        pieceLength: 5,
        length: 10,
        on: jest.fn(),
      } as unknown as Torrent;
      mockStorageService.createStorage.mockResolvedValue({
        location: '/tmp/test-downloads/movie',
        downloadedPieces: new Uint8Array(0),
      } as never);
      mockStorageService.getStorageBySource.mockResolvedValue({
        location: '/tmp/test-downloads/movie',
        downloadedPieces: new Uint8Array(0),
      } as never);
      jest
        .spyOn(
          service as unknown as { addTorrent: (...args: never[]) => Promise<Torrent> },
          'addTorrent'
        )
        .mockResolvedValue(torrent);
      await service.startDownload(
        target({
          id: 1,
          size: 10,
          hash: 'a'.repeat(40),
          magnetLink: 'magnet:?xt=urn:btih:test',
        }),
        WATCHED
      );
      const [, onVerified] = (torrent.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'verified'
      );

      // A serial lock, held by a reclaim while verifies arrive.
      let tail: Promise<void> = Promise.resolve();
      mockStorageService.withSourceLock.mockImplementation(async (_id, operation) => {
        const previous = tail;
        let release!: () => void;
        tail = new Promise<void>(resolve => (release = resolve));
        await previous;
        try {
          return await operation();
        } finally {
          release();
        }
      });
      let finishReclaim!: () => void;
      const reclaim = mockStorageService.withSourceLock(
        1,
        () => new Promise<void>(resolve => (finishReclaim = resolve))
      );
      mockStorageService.updateDownloadProgress.mockClear();

      const first = onVerified();
      const second = onVerified();
      await new Promise(resolve => setImmediate(resolve));
      expect(mockStorageService.updateDownloadProgress).not.toHaveBeenCalled();

      // The reclaim clears the pieces, then lets go of the lock.
      bitfield.buffer = new Uint8Array([0b00000000]);
      finishReclaim();
      await reclaim;
      await Promise.all([first, second]);

      expect(mockStorageService.updateDownloadProgress).toHaveBeenCalledTimes(1);
      expect(mockStorageService.updateDownloadProgress).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: 1, downloadedPieces: new Uint8Array([0]) })
      );
    });

    it('joins an in-flight reconciliation for non-forced calls', async () => {
      const { service, mockStorageService } = setupTest();
      let resolveReconcile!: (value: null) => void;
      const pending = new Promise<null>(resolve => {
        resolveReconcile = resolve;
      });
      mockStorageService.reconcileAllocation.mockReturnValueOnce(pending);
      const reconcile = (
        service as unknown as {
          reconcileAllocationIfDue: (sourceId: number, force?: boolean) => Promise<void>;
        }
      ).reconcileAllocationIfDue.bind(service);

      const firstCall = reconcile(1);
      const joinedCall = reconcile(1);
      expect(mockStorageService.reconcileAllocation).toHaveBeenCalledTimes(1);

      resolveReconcile(null);
      await expect(firstCall).resolves.toBeUndefined();
      await expect(joinedCall).resolves.toBeUndefined();
    });

    it('runs a fresh forced reconciliation after an in-flight call rejects', async () => {
      const { service, mockStorageService } = setupTest();
      let rejectReconcile!: (error: Error) => void;
      const pending = new Promise<null>((_resolve, reject) => {
        rejectReconcile = reject;
      });
      mockStorageService.reconcileAllocation
        .mockReturnValueOnce(pending)
        .mockResolvedValueOnce(null);
      const reconcile = (
        service as unknown as {
          reconcileAllocationIfDue: (sourceId: number, force?: boolean) => Promise<void>;
        }
      ).reconcileAllocationIfDue.bind(service);

      const firstCall = reconcile(1);
      const forcedCall = reconcile(1, true);
      expect(mockStorageService.reconcileAllocation).toHaveBeenCalledTimes(1);
      rejectReconcile(new Error('initial reconciliation failed'));

      await expect(firstCall).rejects.toThrow('initial reconciliation failed');
      await expect(forcedCall).resolves.toBeUndefined();
      expect(mockStorageService.reconcileAllocation).toHaveBeenCalledTimes(2);
    });
  });

  //   describe('getSourceMetadataFile', () => {
  //     beforeEach(() => {
  //       mockRequestService.request.mockResolvedValue(
  //         new Response('udp://tracker1.example.com:1337', {
  //           status: 200,
  //         })
  //       );

  //       mockLoadIPSet.mockImplementation((url: LoadIPSetInput, callback: LoadIPSetCallback) => {
  //         callback(null, { contains: jest.fn() });
  //       });

  //       service = new DownloadService();
  //     });

  //     it('should successfully get source metadata file', async () => {
  //       const sourceLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const mockTorrentFile = Buffer.from('torrent file content');

  //       mockMagnet.mockReturnValue({ infoHash: hash });
  //       mockWebTorrentClient.add.mockImplementation(
  //         (magnetLink: string, callback: ((torrent: Torrent) => void) | undefined) => {
  //           const mockTorrent = { torrentFile: mockTorrentFile } as Torrent;
  //           callback?.(mockTorrent);
  //           return mockTorrent;
  //         }
  //       );

  //       const result = await service.getSourceMetadataFile(sourceLink, hash, 5000);

  //       expect(result).toBe(mockTorrentFile);
  //       expect(mockWebTorrentClient.add).toHaveBeenCalledWith(
  //         sourceLink,
  //         { deselect: true, destroyStoreOnDestroy: true, skipVerify: true },
  //         expect.any(Function)
  //       );
  //     });

  //     it('should handle existing torrent in client', async () => {
  //       const sourceLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const mockTorrentFile = Buffer.from('existing torrent file content');

  //       mockMagnet.mockReturnValue({ infoHash: hash });
  //       mockWebTorrentClient.torrents = [{ infoHash: hash, torrentFile: mockTorrentFile } as Torrent];

  //       const result = await service.getSourceMetadataFile(sourceLink, hash, 5000);

  //       expect(result).toBe(mockTorrentFile);
  //       expect(mockWebTorrentClient.add).not.toHaveBeenCalled();
  //     });

  //     it('should correct malformed magnet links', async () => {
  //       const sourceLink = 'magnet:?xt=urn%3Abtih%3Aabcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const correctedLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';

  //       mockMagnet.mockReturnValue({ infoHash: hash });
  //       mockWebTorrentClient.add.mockImplementation((magnetLink, options, callback) => {
  //         expect(magnetLink).toBe(correctedLink);
  //         const mockTorrent = { torrentFile: Buffer.from('content') };
  //         callback(mockTorrent as any);
  //         return mockTorrent as any;
  //       });

  //       await service.getSourceMetadataFile(sourceLink, hash, 5000);

  //       expect(mockWebTorrentClient.add).toHaveBeenCalledWith(
  //         correctedLink,
  //         expect.any(Object),
  //         expect.any(Function)
  //       );
  //     });

  //     it('should timeout and reject if timeout is reached', async () => {
  //       const sourceLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';

  //       mockMagnet.mockReturnValue({ infoHash: hash });
  //       mockWebTorrentClient.add.mockImplementation(() => {
  //         // Don't call the callback to simulate timeout
  //         return {} as any;
  //       });

  //       await expect(service.getSourceMetadataFile(sourceLink, hash, 100)).rejects.toThrow(
  //         'Timeout after 100 ms while adding file'
  //       );
  //     });

  //     it('should reject if magnet link hash does not match', async () => {
  //       const sourceLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'differenthash1234567890abcdef1234567890abc';

  //       mockMagnet.mockReturnValue({ infoHash: 'abcdef1234567890abcdef1234567890abcdef12' });

  //       await expect(service.getSourceMetadataFile(sourceLink, hash, 5000)).rejects.toThrow(
  //         'Invalid magnet link'
  //       );
  //     });

  //     it('should reject if magnet parsing fails', async () => {
  //       const sourceLink = 'invalid-magnet-link';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';

  //       mockMagnet.mockImplementation(() => {
  //         throw new Error('Invalid magnet link');
  //       });

  //       await expect(service.getSourceMetadataFile(sourceLink, hash, 5000)).rejects.toThrow(
  //         'Error parsing magnet link'
  //       );
  //     });

  //     it('should reject if torrent file is not found', async () => {
  //       const sourceLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';

  //       mockMagnet.mockReturnValue({ infoHash: hash });
  //       mockWebTorrentClient.add.mockImplementation((magnetLink, options, callback) => {
  //         const mockTorrent = { torrentFile: null };
  //         callback(mockTorrent as any);
  //         return mockTorrent as any;
  //       });

  //       await expect(service.getSourceMetadataFile(sourceLink, hash, 5000)).rejects.toThrow(
  //         'File not found'
  //       );
  //     });

  //     it('should reject if WebTorrent add throws an error', async () => {
  //       const sourceLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';

  //       mockMagnet.mockReturnValue({ infoHash: hash });
  //       mockWebTorrentClient.add.mockImplementation(() => {
  //         throw new Error('WebTorrent error');
  //       });

  //       await expect(service.getSourceMetadataFile(sourceLink, hash, 5000)).rejects.toThrow(
  //         'Error adding file to client'
  //       );
  //     });
  //   });

  //   describe('getStats', () => {
  //     beforeEach(() => {
  //       mockEnhancedFetch.mockResolvedValue({
  //         status: 200,
  //         text: async () => 'udp://tracker1.example.com:1337',
  //       } as any);

  //       mockLoadIPSet.mockImplementation((url, options, callback) => {
  //         callback(null, { contains: jest.fn() } as any);
  //       });

  //       service = new DownloadService();
  //     });

  //     it('should successfully get torrent stats', async () => {
  //       const infoHash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const mockScrapeData = { complete: 5, incomplete: 3 };

  //       mockBTClient.once.mockImplementation((event, callback) => {
  //         if (event === 'scrape') {
  //           setTimeout(() => callback(mockScrapeData), 0);
  //         }
  //         return mockBTClient;
  //       });

  //       const result = await service.getStats(infoHash);

  //       expect(result).toEqual({
  //         broadcasters: 5,
  //         watchers: 3,
  //       });
  //       expect(BTClient).toHaveBeenCalledWith({
  //         infoHash: infoHash.toLowerCase(),
  //         announce: ['udp://tracker.opentrackr.org:1337'],
  //         peerId: Buffer.from('01234567890123456789'),
  //         port: 6881,
  //       });
  //     });

  //     it('should handle missing complete/incomplete data', async () => {
  //       const infoHash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const mockScrapeData = {};

  //       mockBTClient.once.mockImplementation((event, callback) => {
  //         if (event === 'scrape') {
  //           setTimeout(() => callback(mockScrapeData), 0);
  //         }
  //         return mockBTClient;
  //       });

  //       const result = await service.getStats(infoHash);

  //       expect(result).toEqual({
  //         broadcasters: 0,
  //         watchers: 0,
  //       });
  //     });

  //     it('should handle scrape errors', async () => {
  //       const infoHash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const error = new Error('Scrape error');

  //       mockBTClient.once.mockImplementation((event, callback) => {
  //         if (event === 'error') {
  //           setTimeout(() => callback(error), 0);
  //         }
  //         return mockBTClient;
  //       });

  //       await expect(service.getStats(infoHash)).rejects.toThrow('Scrape error');
  //     });

  //     it('should handle scrape timeout', async () => {
  //       const infoHash = 'abcdef1234567890abcdef1234567890abcdef12';

  //       mockBTClient.once.mockImplementation(() => {
  //         // Don't call any callbacks to simulate timeout
  //         return mockBTClient;
  //       });

  //       await expect(service.getStats(infoHash)).rejects.toThrow(
  //         expect.objectContaining({
  //           message: expect.stringContaining('Scrape request timed out'),
  //         })
  //       );
  //     }, 10000);

  //     it('should destroy client on success', async () => {
  //       const infoHash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const mockScrapeData = { complete: 1, incomplete: 2 };

  //       mockBTClient.once.mockImplementation((event, callback) => {
  //         if (event === 'scrape') {
  //           setTimeout(() => callback(mockScrapeData), 0);
  //         }
  //         return mockBTClient;
  //       });

  //       await service.getStats(infoHash);

  //       expect(mockBTClient.destroy).toHaveBeenCalled();
  //     });

  //     it('should destroy client on error', async () => {
  //       const infoHash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const error = new Error('Scrape error');

  //       mockBTClient.once.mockImplementation((event, callback) => {
  //         if (event === 'error') {
  //           setTimeout(() => callback(error), 0);
  //         }
  //         return mockBTClient;
  //       });

  //       try {
  //         await service.getStats(infoHash);
  //       } catch (e) {
  //         // Expected to throw
  //       }

  //       expect(mockBTClient.destroy).toHaveBeenCalled();
  //     });
  //   });

  describe('storage delete event handling', () => {
    it('should remove torrent when storage is deleted with valid hash', async () => {
      const { service, mockStorageService } = setupTest();

      // Mock a torrent in the client
      const mockTorrent = {
        infoHash: 'testhash123',
        destroy: jest.fn(),
      };
      service.client.get = jest.fn().mockReturnValue(mockTorrent);
      service.client.remove = jest.fn();

      // Get the delete event handler that was registered
      const deleteCall = mockStorageService.on.mock.calls.find(call => call[0] === 'delete');
      const deleteHandler = deleteCall?.[1];
      if (!deleteHandler) {
        throw new Error('Delete event handler not found');
      }

      // Create a mock storage with ContentSource relation
      const mockStorage = createMockStorageWithHash('testhash123', {
        id: 1,
        sourceId: 123,
        location: '/test/location',
      });

      // Trigger the delete event
      await deleteHandler(mockStorage);

      expect(service.client.get).toHaveBeenCalledWith('testhash123');
      expect(service.client.remove).toHaveBeenCalledWith(mockTorrent, { destroyStore: true });
      expect(logger.info).toHaveBeenCalledWith(
        'DownloadService',
        'Removed torrent for deleted storage: /test/location'
      );
    });

    it('should handle storage deletion without hash gracefully', () => {
      const { mockStorageService } = setupTest();

      // Get the delete event handler that was registered
      const deleteCall = mockStorageService.on.mock.calls.find(call => call[0] === 'delete');
      const deleteHandler = deleteCall?.[1];
      if (!deleteHandler) {
        throw new Error('Delete event handler not found');
      }

      // Create a mock storage without ContentSource relation
      const mockStorage = createMockStorageWithoutContentSource({
        id: 1,
        sourceId: 123,
        location: '/test/location',
      });

      // Trigger the delete event
      deleteHandler(mockStorage);

      expect(logger.warn).toHaveBeenCalledWith(
        'DownloadService',
        'No hash found for storage 1, cannot remove torrent'
      );
    });

    it('should handle storage deletion with undefined hash gracefully', () => {
      const { mockStorageService } = setupTest();

      // Get the delete event handler that was registered
      const deleteCall = mockStorageService.on.mock.calls.find(call => call[0] === 'delete');
      const deleteHandler = deleteCall?.[1];
      if (!deleteHandler) {
        throw new Error('Delete event handler not found');
      }

      // Create a mock storage with undefined hash
      const mockStorage = createMockStorageWithUndefinedHash({
        id: 1,
        sourceId: 123,
        location: '/test/location',
      });

      // Trigger the delete event
      deleteHandler(mockStorage);

      expect(logger.warn).toHaveBeenCalledWith(
        'DownloadService',
        'No hash found for storage 1, cannot remove torrent'
      );
    });
  });

  describe('error handling', () => {
    it('should log WebTorrent client errors', () => {
      setupTest();

      // Get the error handler that was registered
      const errorHandler = mockedTorrentInstance.on.mock.calls.find(call => call[0] === 'error')[1];

      const testError = new Error('Test WebTorrent error');
      errorHandler(testError);

      expect(logger.error).toHaveBeenCalledWith(
        'DownloadService',
        'Error:',
        'Test WebTorrent error',
        testError
      );
    });
  });
});
