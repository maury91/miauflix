import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import EncryptedChunkStore from '../../src/chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import type { StorageService } from '../../src/storage/storage.service';
import type { EncryptedStorageLayout, PlaybackTarget } from '../../src/storage/types';
import {
  createMockContentSource,
  createMockStorage,
  type Mocked,
  mockEngineModules,
  mockInstance,
  testConfig,
} from '../helpers/engine';

mockEngineModules();

const { DownloadService } = await import('../../src/engine/download.service');
const { EncryptedFileReader } = await import('../../src/engine/encrypted-file-reader');
const { StorageService: StorageServiceClass } = await import('../../src/storage/storage.service');

const ENCRYPTION_KEY = 'b'.repeat(32);
const HASH = 'c'.repeat(40);

const createConfig = () =>
  testConfig({ DISABLE_DISCOVERY: true, STATIC_TRACKERS: [], SOURCE_SECURITY_KEY: ENCRYPTION_KEY });

/** Write a two-episode pack through the same encrypted store WebTorrent uses. */
const writePack = async (location: string, layout: EncryptedStorageLayout, bytes: Buffer) => {
  const writer = new EncryptedChunkStore(layout.pieceLength, {
    path: location,
    name: layout.storeName,
    files: layout.files,
    encryptionKey: ENCRYPTION_KEY,
    encryptionVersion: layout.encryptionVersion ?? 1,
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
    const storageService = mockInstance(StorageServiceClass) as Mocked<StorageService>;
    const service = new DownloadService(storageService, config);
    (service.client as unknown as { ready: boolean }).ready = true;
    storageService.withSourceLock.mockImplementation(async (_id, operation) => operation());
    storageService.setPlaybackActive.mockResolvedValue(true);
    storageService.getFiles.mockResolvedValue([]);
    storageService.getClaimedPaths.mockResolvedValue([]);
    storageService.getLiveClaims.mockResolvedValue([]);

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

  beforeEach(async () => {
    location = await mkdtemp(path.join(os.tmpdir(), 'miauflix-pack-'));
  });

  afterEach(async () => {
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
    for (const path of ['Show/Show.S01E01.mkv', 'Show/Show.S01E02.mkv'])
      expect(storageService.claimFile).toHaveBeenCalledWith(
        31,
        path,
        expect.objectContaining({ kind: 'playback', ownerKey: 'stream' }),
        true
      );
    expect(storageService.updateEncryptedLayout).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    // Each stream releases playback after closing its reader's files, just after the body ends.
    // Closing is real file I/O, so it takes as many event-loop turns as the machine needs.
    const deadline = Date.now() + 2_000;
    while (service.hasActivePlayback() && Date.now() < deadline)
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

    await expect(service.streamFile(episode('Show/Show.S01E03.mkv'))).rejects.toMatchObject({
      status: 'source_file_unavailable',
    });
  });

  it('preserves the missing storage error during playback admission', async () => {
    const { service, storageService, storage, episode } = await setupTest();
    storageService.getStorageBySource.mockResolvedValueOnce(storage).mockResolvedValue(null);

    await expect(service.streamFile(episode('Show/Show.S01E01.mkv'))).rejects.toMatchObject({
      status: 'local_media_unavailable',
    });
  });

  it('admits and releases playback when a listener throws', async () => {
    const { service, storageService, episode } = await setupTest();
    service.onPlaybackChange(() => {
      throw new Error('Listener failed');
    });
    const listener = jest.fn();
    service.onPlaybackChange(listener);

    const response = await service.streamFile(episode('Show/Show.S01E01.mkv'));
    await response.body!.cancel();

    expect(listener.mock.calls).toEqual([[[31]], [[]]]);
    expect(service.hasActivePlayback()).toBe(false);
    expect(storageService.setPlaybackActive).toHaveBeenLastCalledWith(31, false);
  });
});

describe('DownloadService reclaiming one file of a pack', () => {
  let location: string;

  // Pieces of 4 bytes: A [0,6) = pieces 0-1, B [6,20) = pieces 1-4, C [20,26) = pieces 5-6.
  // Piece 1 is shared by A and B, so reclaiming A also clears B's first piece.
  const layout: EncryptedStorageLayout = {
    storeName: 'Show S01 - cccccccc',
    filenameSalt: `download-${HASH}`,
    pieceLength: 4,
    files: [
      { path: 'Show/A.mkv', offset: 0, length: 6 },
      { path: 'Show/B.mkv', offset: 6, length: 14 },
      { path: 'Show/C.mkv', offset: 20, length: 6 },
    ],
  };
  const FULL = Uint8Array.of(0b11111110);

  const setupTest = async () => {
    const config = createConfig();
    const storageService = mockInstance(StorageServiceClass) as Mocked<StorageService>;
    const service = new DownloadService(storageService, config);
    storageService.getLiveClaims.mockResolvedValue([]);
    await writePack(location, layout, Buffer.from('AAAAAA' + 'B'.repeat(14) + 'CCCCCC'));
    const source = createMockContentSource({ id: 41, hash: HASH, size: 26 });
    const storage = createMockStorage({
      sourceId: source.id,
      contentSource: source,
      location,
      size: 26,
      downloadedPieces: FULL,
      encryptedLayout: structuredClone(layout),
    });
    storageService.getStorageBySource.mockResolvedValue(storage);
    const reclaim = (paths: string[], pieces: Array<{ first: number; last: number }>) =>
      (
        service as unknown as {
          reclaimStoredFiles: (...args: unknown[]) => Promise<Uint8Array | void>;
        }
      ).reclaimStoredFiles(storage, paths, pieces);
    const readPiece = async (filePath: string, index: number) => {
      const reader = new EncryptedFileReader(location, layout, filePath, ENCRYPTION_KEY);
      try {
        return (await reader.readPiece(index)).toString();
      } finally {
        await reader.close();
      }
    };
    return { service, storage, reclaim, readPiece };
  };

  beforeEach(async () => {
    location = await mkdtemp(path.join(os.tmpdir(), 'miauflix-reclaim-'));
  });

  afterEach(async () => {
    await rm(location, { recursive: true, force: true });
  });

  it('deletes only that file and leaves the neighbor readable for the pieces it owns', async () => {
    const { reclaim, readPiece } = await setupTest();
    expect(await readdir(location)).toHaveLength(3);

    await reclaim(['Show/A.mkv'], [{ first: 0, last: 1 }]);

    expect(await readdir(location)).toHaveLength(2);
    // B owns pieces 2-4 outright; they still decrypt to its bytes.
    expect(await readPiece('Show/B.mkv', 2)).toBe('BBBB');
    expect(await readPiece('Show/B.mkv', 4)).toBe('BBBB');
    expect(await readPiece('Show/C.mkv', 5)).toBe('CCCC');
  });

  it('clears the piece range, boundary piece included, from the attached torrent', async () => {
    const { service, storage, reclaim } = await setupTest();
    const bits = new Uint8Array(FULL);
    const bitfield = {
      buffer: bits,
      get: (piece: number) => (bits[piece >> 3] & (0x80 >> (piece & 7))) !== 0,
      set: (piece: number, value: boolean) => {
        if (value) bits[piece >> 3] |= 0x80 >> (piece & 7);
        else bits[piece >> 3] &= ~(0x80 >> (piece & 7));
      },
    };
    const markUnverified = jest.fn((piece: number) => bitfield.set(piece, false));
    const reservations: unknown[] = [null, null, null, null, null, null, null];
    const live = new EncryptedChunkStore(4, {
      path: location,
      name: layout.storeName,
      files: layout.files.map(file => ({ ...file })),
      encryptionKey: ENCRYPTION_KEY,
      encryptionVersion: layout.encryptionVersion ?? 1,
      filenameSalt: layout.filenameSalt,
    });
    const torrent = {
      path: location,
      destroyed: false,
      done: true,
      bitfield,
      store: { store: { store: live } },
      _markUnverified: markUnverified,
      _reservations: reservations,
    };
    const torrents = (service.client as unknown as { torrents: unknown[] }).torrents;
    torrents.push(torrent);
    try {
      const result = await reclaim(['Show/A.mkv'], [{ first: 0, last: 1 }]);

      expect(markUnverified.mock.calls).toEqual([[0], [1]]);
      expect(reservations[1]).toEqual([]);
      expect(reservations[2]).toBeNull();
      expect(torrent.done).toBe(false);
      // Only B's first piece is missing now; its other pieces stay verified.
      expect(Array.from(result as Uint8Array)).toEqual([0b00111110]);
      expect(storage.downloadedPieces).toEqual(FULL);
      expect(await readdir(location)).toHaveLength(2);

      // The live store reopens the removed file when the boundary piece arrives again.
      await new Promise<void>((resolve, reject) =>
        live.put(1, Buffer.from('AABB'), error => (error ? reject(error) : resolve()))
      );
      expect(await readdir(location)).toHaveLength(3);
    } finally {
      torrents.length = 0;
      await new Promise<void>(resolve => live.close(() => resolve()));
    }
  });
});
