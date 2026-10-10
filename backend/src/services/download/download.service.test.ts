jest.mock('./torrent-diagnostics');
jest.mock('./encrypted-file-reader', () => ({
  EncryptedFileReader: jest.fn().mockImplementation(() => ({
    readPiece: jest.fn().mockResolvedValue(Buffer.alloc(10)),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

import {
  createMockStorage,
  createMockStorageWithHash,
  createMockStorageWithoutMovieSource,
  createMockStorageWithUndefinedHash,
} from '@__test-utils__/mocks/storage.mock';
import { logger } from '@logger';
import { Client as BTClient } from 'bittorrent-tracker';
import loadIPSet from 'load-ip-set';
import type { Torrent } from 'webtorrent';

import { Database } from '@database/database';
import type { EncryptedStorageLayout, Storage } from '@entities/storage.entity';
import { ConfigurationService } from '@services/configuration/configuration.service';
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
        encryptedLayout: {
          storeName: 'test',
          filenameSalt: 'download-AbCd',
          pieceLength: 4,
          files: [{ path: 'video.mkv', length: 12, offset: 0 }],
          video: { name: 'video.mkv', path: 'video.mkv', offset: 3, length: 5 },
        },
        movieSource: { hash: 'AbCd' },
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
        bitfield: { get: (piece: number) => piece < 2 },
      } as Torrent;
      expect(service.getStorageActivity(baseStorage)).toMatchObject({
        activity: 'available_offline',
        videoComplete: true,
        torrentLoaded: true,
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
      mockStorageService.getStorageByMovieSource.mockResolvedValue(storage as never);
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

      const response = await service.streamFile({
        id: 1,
        size: 10,
        hash: 'a'.repeat(40),
        magnetLink: 'magnet:?xt=urn:btih:test',
        file: null,
      } as never);
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
        video: { name: 'movie.mkv', path: 'movie.mkv', offset: 0, length: 8 },
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
      mockStorageService.getStorageByMovieSource.mockResolvedValue(storage);
      mockStorageService.detachCompletedStorage.mockImplementation(async (_id, detach) => {
        await detach();
        return { ...storage, localOnly: true };
      });
      jest.spyOn(service, 'startDownload').mockResolvedValue({
        movieSourceId: storage.movieSourceId,
        torrent,
        storage,
        layout,
        startTime: new Date(),
      });

      const response = await service.streamFile({ id: storage.movieSourceId, size: 8 } as never);
      const reader = response.body!.getReader();
      const first = await reader.read();
      const detach = (
        service as unknown as {
          detachCompletedTorrent: (sourceId: number) => Promise<void>;
        }
      ).detachCompletedTorrent;
      await detach.call(service, storage.movieSourceId);
      const second = await reader.read();
      const end = await reader.read();

      expect(Buffer.concat([Buffer.from(first.value!), Buffer.from(second.value!)])).toHaveLength(
        8
      );
      expect(end.done).toBe(true);
      expect(webtorrent.remove).toHaveBeenCalledWith(torrent, { destroyStore: false });
      expect(service.hasActivePlayback()).toBe(false);
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
        video: { name: 'movie.mkv', path: 'movie.mkv', offset: 0, length: 8 },
      };
      const storage = createMockStorage({
        location: '/tmp/test-downloads/movie',
        size: 8,
        videoCompletedAt: new Date(Date.now() - 60 * 60_000),
        localOnly: true,
        encryptedLayout: layout,
      });
      mockStorageService.createStorage.mockResolvedValue(storage);
      mockStorageService.getStorageByMovieSource.mockResolvedValue(storage);
      mockStorageService.withSourceLock.mockImplementation(async (_id, operation) => operation());
      mockStorageService.setPlaybackActive.mockResolvedValue(true);

      const response = await service.streamFile({
        id: storage.movieSourceId,
        size: 8,
        hash: storage.movieSource.hash,
      } as never);
      const media = await response.arrayBuffer();

      expect(media.byteLength).toBe(8);
      expect(webtorrent.add).not.toHaveBeenCalled();
    });
  });

  describe('source promotion', () => {
    it('starts the watched download with a reservation and marks the selected file accessed', async () => {
      const { service, mockStorageService } = setupTest();
      const file = { name: 'movie.mkv', length: 10, select: jest.fn() };
      const download = { torrent: { files: [file] } };
      const startDownload = jest
        .spyOn(service, 'startDownload')
        .mockResolvedValue(download as never);
      const source = {
        id: 12,
        size: 100,
        hash: 'a'.repeat(40),
        magnetLink: 'magnet:?xt=urn:btih:test',
      } as never;

      await expect(service.promoteSource(source)).resolves.toBe(true);

      expect(startDownload).toHaveBeenCalledWith(source, {
        retentionClass: 'watched',
        reservedBytes: 100,
      });
      expect(mockStorageService.reserveStorage).not.toHaveBeenCalled();
      expect(file.select).toHaveBeenCalledTimes(1);
      expect(mockStorageService.markAsAccessed).toHaveBeenCalledWith(12);
    });

    it.each(['watched', 'speculative'] as const)(
      'preserves %s torrent selection when warming the source',
      async retentionClass => {
        const { service } = setupTest();
        const file = {
          name: 'movie.mkv',
          offset: 0,
          length: 10,
          select: jest.fn(),
          deselect: jest.fn(),
        };
        const torrent = {
          files: [file],
          pieces: new Array(5),
          pieceLength: 2,
          select: jest.fn(),
        };
        jest.spyOn(service, 'startDownload').mockResolvedValue({
          torrent,
          storage: { retentionClass },
        } as never);
        const source = { id: 12, size: 10 } as never;

        await service.warmSource(source, 4);

        if (retentionClass === 'watched') {
          expect(file.select).toHaveBeenCalledTimes(1);
          expect(file.deselect).not.toHaveBeenCalled();
          expect(torrent.select).not.toHaveBeenCalled();
        } else {
          expect(file.select).not.toHaveBeenCalled();
          expect(file.deselect).toHaveBeenCalledTimes(1);
          expect(torrent.select).toHaveBeenCalledWith(0, 1, 1);
        }
      }
    );
  });

  describe('download tracking and allocation reconciliation', () => {
    it('starts completion from the selected video pieces even when auxiliary torrent pieces are missing', async () => {
      const { service, mockStorageService } = setupTest();
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
        files: [{ path: 'movie.mkv', offset: 0, length: 12 }],
        video: { name: 'movie.mkv', path: 'movie.mkv', offset: 3, length: 5 },
      };
      const torrent = { bitfield: { get: (index: number) => index < 2 } };
      const maybeMark = (
        service as unknown as {
          maybeMarkVideoComplete: (
            torrent: Torrent,
            id: number,
            layout: EncryptedStorageLayout
          ) => Promise<void>;
        }
      ).maybeMarkVideoComplete;

      await maybeMark.call(service, torrent as never, 42, layout);

      expect(mockStorageService.markVideoComplete).toHaveBeenCalledWith(42, layout);
      expect(schedule).toHaveBeenCalledWith(completedStorage);
    });

    it('detaches at the configured deadline and preserves a completed storage row', async () => {
      const { service, mockStorageService } = setupTest();
      jest.useFakeTimers();
      try {
        const completionTime = new Date(Date.now());
        let storage = createMockStorage({ videoCompletedAt: completionTime, localOnly: false });
        mockStorageService.getStorageByMovieSource.mockImplementation(async () => storage);
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
          storage.movieSourceId,
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
        mockStorageService.getStorageByMovieSource.mockResolvedValue(storage);
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
        mockStorageService.getStorageByMovieSource.mockResolvedValue(storage);
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
          storage.movieSourceId,
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
        video: { name: 'movie.mkv', path: 'movie.mkv', offset: 0, length: 8 },
      };
      const activeStorage = createMockStorage({
        videoCompletedAt: new Date(Date.now() - 30 * 60_000),
        localOnly: false,
        encryptedLayout: layout,
      });
      mockStorageService.getStoragesWithCompletion.mockResolvedValue([activeStorage]);
      mockStorageService.getStorageByMovieSource.mockResolvedValue(activeStorage);
      const file = { path: 'movie.mkv', select: jest.fn() };
      const torrent = {
        files: [file],
        bitfield: { get: () => true },
        pieces: new Array(2),
        pieceLength: 4,
        length: 8,
        on: jest.fn(),
        once: jest.fn(),
        removeListener: jest.fn(),
      } as unknown as Torrent;
      const addTorrent = jest
        .spyOn(
          service as unknown as { addTorrentWithLock: (...args: never[]) => Promise<Torrent> },
          'addTorrentWithLock'
        )
        .mockResolvedValue(torrent);
      const restore = (service as unknown as { restoreCompletedDownloads: () => Promise<void> })
        .restoreCompletedDownloads;

      await restore.call(service);

      expect(addTorrent).toHaveBeenCalledWith(activeStorage.movieSource, activeStorage);
      expect(file.select).toHaveBeenCalledTimes(1);

      const expiredStorage = createMockStorage({
        videoCompletedAt: new Date(Date.now() - 2 * 60 * 60_000),
        localOnly: false,
        encryptedLayout: layout,
      });
      mockStorageService.getStoragesWithCompletion.mockResolvedValue([expiredStorage]);
      mockStorageService.getStorageByMovieSource.mockResolvedValue(expiredStorage);
      addTorrent.mockClear();
      await restore.call(service);

      expect(addTorrent).not.toHaveBeenCalled();
      expect(mockStorageService.detachCompletedStorage).toHaveBeenCalledWith(
        expiredStorage.movieSourceId,
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

      expect(detach).toHaveBeenCalledWith(storage.movieSourceId);
      expect(retry).toHaveBeenCalledWith(storage.movieSourceId);
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
      mockStorageService.getStorageByMovieSource.mockResolvedValue({
        location: '/tmp/test-downloads/movie',
        downloadedPieces: new Uint8Array(0),
      } as never);
      jest
        .spyOn(
          service as unknown as { addTorrent: (...args: never[]) => Promise<Torrent> },
          'addTorrent'
        )
        .mockResolvedValue(torrent);

      await service.startDownload({
        id: 1,
        size: 50,
        hash: sourceHash,
        magnetLink: 'magnet:?xt=urn:btih:test',
      } as never);

      expect(mockStorageService.updateDownloadProgress).toHaveBeenCalledWith(
        expect.objectContaining({ totalPieces: 5 })
      );
      expect(mockStorageService.updateTorrentLayout).toHaveBeenCalledWith(1, 5, 10, 50);
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
        video: { name: 'movie.mkv', path: 'movie.mkv', offset: 0, length: 4 },
      };
      const storage = createMockStorage({
        location: '/tmp/test-downloads/local-movie',
        videoCompletedAt: new Date(),
        localOnly: true,
        encryptedLayout: layout,
      });
      mockStorageService.createStorage.mockResolvedValue(storage);
      mockStorageService.getStorageByMovieSource.mockResolvedValue(storage);

      const result = await service.startDownload({
        id: storage.movieSourceId,
        hash: sourceHash,
        magnetLink: `magnet:?xt=urn:btih:${sourceHash}`,
        size: 4,
      } as never);

      expect(result.torrent).toBeNull();
      expect(result.layout?.filenameSalt).toBe(`download-${sourceHash}`);
      expect(mockStorageService.updateEncryptedLayout).toHaveBeenCalledWith(
        storage.movieSourceId,
        expect.objectContaining({ filenameSalt: `download-${sourceHash}` })
      );
    });

    it('records completion when the selected video is already verified on open', async () => {
      const { service, mockStorageService } = setupTest();
      const sourceId = 44;
      const hash = 'a'.repeat(40);
      const storage = createMockStorage({
        movieSourceId: sourceId,
        location: '/tmp/test-downloads/completed-movie',
        size: 8,
      });
      mockStorageService.createStorage.mockResolvedValue(storage);
      mockStorageService.getStorageByMovieSource.mockResolvedValue(storage);
      mockStorageService.markVideoComplete.mockResolvedValue(
        createMockStorage({ videoCompletedAt: new Date(), localOnly: false })
      );
      const torrent = {
        infoHash: hash,
        name: 'movie',
        files: [{ name: 'movie.mkv', path: 'movie.mkv', offset: 0, length: 8, select: jest.fn() }],
        pieces: new Array(2),
        bitfield: { get: () => true, buffer: Uint8Array.of(3) },
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

      await service.startDownload({
        id: sourceId,
        size: 8,
        hash,
        magnetLink: `magnet:?xt=urn:btih:${hash}`,
      } as never);

      expect(mockStorageService.markVideoComplete).toHaveBeenCalledWith(
        sourceId,
        expect.objectContaining({
          video: { name: 'movie.mkv', path: 'movie.mkv', offset: 0, length: 8 },
        })
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
      mockStorageService.getStorageByMovieSource.mockResolvedValue({
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
      const source = {
        id: 1,
        size: 10,
        hash: 'a'.repeat(40),
        magnetLink: 'magnet:?xt=urn:btih:test',
      } as never;

      const first = service.startDownload(source);
      const second = service.startDownload(source);
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
      mockStorageService.getStorageByMovieSource.mockResolvedValue({
        location: '/tmp/test-downloads/movie',
        downloadedPieces: new Uint8Array(0),
      } as never);
      jest
        .spyOn(
          service as unknown as { addTorrent: (...args: never[]) => Promise<Torrent> },
          'addTorrent'
        )
        .mockResolvedValue(torrent);
      const source = {
        id: 1,
        size: 10,
        hash: 'a'.repeat(40),
        magnetLink: 'magnet:?xt=urn:btih:test',
      } as never;

      await service.startDownload(source);
      await service.startDownload(source);

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
      mockStorageService.getStorageByMovieSource.mockResolvedValue({
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
        ({
          id,
          size: 10,
          hash: 'a'.repeat(40),
          magnetLink: 'magnet:?xt=urn:btih:test',
        }) as never;

      await service.startDownload(source(1));
      await service.startDownload(source(2));

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
        expect.objectContaining({ movieSourceId: 1 })
      );
      expect(mockStorageService.updateDownloadProgress).toHaveBeenCalledWith(
        expect.objectContaining({ movieSourceId: 2 })
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
          reconcileAllocationIfDue: (movieSourceId: number, force?: boolean) => Promise<void>;
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
          reconcileAllocationIfDue: (movieSourceId: number, force?: boolean) => Promise<void>;
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

      // Create a mock storage with MovieSource relation
      const mockStorage = createMockStorageWithHash('testhash123', {
        id: 1,
        movieSourceId: 123,
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

      // Create a mock storage without MovieSource relation
      const mockStorage = createMockStorageWithoutMovieSource({
        id: 1,
        movieSourceId: 123,
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
        movieSourceId: 123,
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
