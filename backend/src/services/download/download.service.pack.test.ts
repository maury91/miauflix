jest.mock('bittorrent-tracker');
jest.mock('load-ip-set');
jest.mock('@logger');
jest.mock('@services/storage/storage.service');
jest.mock('@services/request/request.service');
jest.mock('@database/database');
jest.mock('@services/configuration/configuration.service');
jest.mock('./torrent-diagnostics');

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createMockContentSource } from '@__test-utils__/mocks/movie.mock';
import { createMockStorage } from '@__test-utils__/mocks/storage.mock';
import { configureFakerSeed } from '@__test-utils__/utils';

import { Database } from '@database/database';
import type { EncryptedStorageLayout } from '@entities/storage.entity';
import { ConfigurationService } from '@services/configuration/configuration.service';
import type { PlaybackTarget } from '@services/playback/playback-target';
import { RequestService } from '@services/request/request.service';
import { StatsService } from '@services/stats/stats.service';
import { StorageService } from '@services/storage/storage.service';

import EncryptedChunkStore from '../../chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import { DownloadService } from './download.service';

const ENCRYPTION_KEY = 'b'.repeat(32);
const HASH = 'c'.repeat(40);

const createConfig = () => {
  const values: Record<string, unknown> = {
    CONTENT_CONNECTION_LIMIT: 100,
    CONTENT_DOWNLOAD_LIMIT: 1000000,
    CONTENT_UPLOAD_LIMIT: 500000,
    CONTENT_SEED_DURATION_SECONDS: 3600,
    DISABLE_DISCOVERY: true,
    STATIC_TRACKERS: [],
    SCRAPE_TRACKERS: [],
    BEST_TRACKERS_DOWNLOAD_URL: 'https://example.com/trackers_best.txt',
    BLACKLISTED_TRACKERS_DOWNLOAD_URL: 'https://example.com/blacklist.txt',
    DOWNLOAD_PATH: '/tmp/test-downloads',
    DOWNLOAD_SALT: 'a'.repeat(32),
    SOURCE_SECURITY_KEY: ENCRYPTION_KEY,
  };
  const config = new ConfigurationService() as unknown as jest.Mocked<ConfigurationService>;
  config.get.mockImplementation((key: string) => values[key] as never);
  config.getOrThrow.mockImplementation((key: string) => {
    if (key in values) return values[key] as never;
    throw new Error(`${key} is not set`);
  });
  return config;
};

/** Write a two-episode pack through the same encrypted store WebTorrent uses. */
const writePack = async (location: string, layout: EncryptedStorageLayout, bytes: Buffer) => {
  const writer = new EncryptedChunkStore(layout.pieceLength, {
    path: location,
    name: layout.storeName,
    files: layout.files,
    encryptionKey: ENCRYPTION_KEY,
    filenameSalt: layout.filenameSalt,
  });
  try {
    for (let index = 0; index * layout.pieceLength < bytes.length; index += 1) {
      const piece = bytes.subarray(index * layout.pieceLength, (index + 1) * layout.pieceLength);
      await new Promise<void>((resolve, reject) => {
        writer.put(index, piece, error => (error ? reject(error) : resolve()));
      });
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      writer.close(error => (error ? reject(error) : resolve()));
    });
  }
};

describe('DownloadService with a shared season pack', () => {
  let location: string;

  const setupTest = async () => {
    const config = createConfig();
    const storageService = new StorageService(
      new Database({} as never),
      config
    ) as jest.Mocked<StorageService>;
    const service = new DownloadService(
      storageService,
      new RequestService(new StatsService(), config) as never,
      config
    );
    (service.client as unknown as { ready: boolean }).ready = true;
    storageService.withSourceLock.mockImplementation(async (_id, operation) => operation());
    storageService.setPlaybackActive.mockResolvedValue(true);

    const layout: EncryptedStorageLayout = {
      storeName: 'Show S01 - cccccccc',
      filenameSalt: `download-${HASH}`,
      pieceLength: 4,
      files: [
        { path: 'Show/Show.S01E01.mkv', offset: 0, length: 6 },
        { path: 'Show/Show.S01E02.mkv', offset: 6, length: 6 },
      ],
    };
    await writePack(location, layout, Buffer.from('AAAAAABBBBBB'));
    const source = createMockContentSource({ id: 31, hash: HASH, size: 12 });
    const storage = createMockStorage({
      sourceId: source.id,
      contentSource: source,
      location,
      size: 12,
      localOnly: true,
      videoCompletedAt: new Date(),
      selectedFiles: layout.files.map(file => file.path),
      downloadedPieces: Uint8Array.of(0b11100000),
      encryptedLayout: structuredClone(layout),
    });
    storageService.createStorage.mockResolvedValue(storage);
    storageService.getStorageBySource.mockResolvedValue(storage);

    const episode = (filePath: string): PlaybackTarget => ({
      source,
      filePath,
      matchKind: 'single',
    });
    return { service, storageService, storage, layout, episode };
  };

  beforeAll(() => {
    configureFakerSeed();
  });

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['Date', 'queueMicrotask', 'setImmediate'] });
    location = await mkdtemp(path.join(os.tmpdir(), 'miauflix-pack-'));
  });

  afterEach(async () => {
    jest.useRealTimers();
    await rm(location, { recursive: true, force: true });
  });

  it('streams two episodes concurrently with the correct bytes and leaves the layout unchanged', async () => {
    const { service, storageService, storage, layout, episode } = await setupTest();
    const add = jest.spyOn(service.client, 'add');

    const [first, second] = await Promise.all([
      service.streamFile(episode('Show/Show.S01E01.mkv')),
      service.streamFile(episode('Show/Show.S01E02.mkv')),
    ]);
    const [firstBytes, secondBytes] = await Promise.all([first.text(), second.text()]);

    expect(firstBytes).toBe('AAAAAA');
    expect(secondBytes).toBe('BBBBBB');
    expect(first.headers.get('Content-Disposition')).toContain('Show.S01E01.mkv');
    expect(second.headers.get('Content-Disposition')).toContain('Show.S01E02.mkv');
    expect(storage.encryptedLayout).toEqual(layout);
    expect(storageService.updateEncryptedLayout).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    // Each stream releases playback after closing its reader, just after the body ends.
    for (let tick = 0; tick < 20 && service.hasActivePlayback(); tick += 1)
      await new Promise(resolve => setImmediate(resolve));
    expect(service.hasActivePlayback()).toBe(false);
  });

  it('serves a byte range from the second episode relative to that episode', async () => {
    const { service, episode } = await setupTest();

    const response = await service.streamFile(episode('Show/Show.S01E02.mkv'), 'bytes=2-4');

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 2-4/6');
    expect(await response.text()).toBe('BBB');
  });

  it('rejects a file that is not part of the source', async () => {
    const { service, episode } = await setupTest();

    await expect(service.streamFile(episode('Show/Show.S01E03.mkv'))).rejects.toThrow(
      'Requested file is not part of this source'
    );
  });
});
