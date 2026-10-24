jest.mock('bittorrent-tracker');
jest.mock('load-ip-set');
jest.mock('@logger');
jest.mock('@services/request/request.service');
jest.mock('./torrent-diagnostics');
jest.unmock('@database/database');

import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createTestDatabase } from '@__test-utils__/database.helpers';
import { TestDataFactory } from '@__test-utils__/test-data.factory';

import type { ContentSource } from '@entities/content-source.entity';
import type { EncryptedStorageLayout } from '@entities/storage.entity';
import type { ConfigService } from '@mytypes/configuration';
import { RequestService } from '@services/request/request.service';
import { StatsService } from '@services/stats/stats.service';
import { StorageService } from '@services/storage/storage.service';

import EncryptedChunkStore from '../../chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import { DownloadService } from './download.service';
import { isPieceInBitfield } from './download.utils';
import { EncryptedFileReader } from './encrypted-file-reader';

const ENCRYPTION_KEY = 'b'.repeat(32);
const PIECE_LENGTH = 4;
const EPISODE_BYTES = 6;

/**
 * Real database, real encrypted store, real StorageService and DownloadService; only the
 * WebTorrent attach is faked (it would reach for the network).
 */
describe('reclaiming files of a pack', () => {
  let dbHelper: ReturnType<typeof createTestDatabase>;
  let factory: TestDataFactory;
  let downloads: string;

  const setupTest = async (thresholdBytes = 10n * 1024n * 1024n) => {
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
      DOWNLOAD_PATH: downloads,
      DOWNLOAD_SALT: 'a'.repeat(32),
      SOURCE_SECURITY_KEY: ENCRYPTION_KEY,
      STORAGE_THRESHOLD: thresholdBytes,
    };
    const config = {
      get: (key: string) => values[key],
      getOrThrow: (key: string) => {
        if (key in values) return values[key];
        throw new Error(`${key} is not set`);
      },
      registerService: () => undefined,
    } as unknown as ConfigService;
    const database = dbHelper.getDatabase();
    const storageService = new StorageService(database, config);
    const service = new DownloadService(
      storageService,
      new RequestService(new StatsService(), config as never) as never,
      config
    );
    // init() drops stale playback claims; let it finish before the test creates its own.
    for (let tick = 0; tick < 50 && service.getStatus().status !== 'ready'; tick += 1)
      await new Promise(resolve => setImmediate(resolve));
    const addTorrent = jest.spyOn(
      service as unknown as { addTorrent: (...args: unknown[]) => Promise<unknown> },
      'addTorrent'
    );
    addTorrent.mockImplementation(async (...args: unknown[]) => {
      const source = args[0] as ContentSource;
      return {
        infoHash: source.hash,
        name: 'pack',
        path: '',
        ready: false,
        pieceLength: PIECE_LENGTH,
        files: [],
        on: jest.fn(),
      };
    });
    const setThreshold = async (bytes: bigint) => {
      values.STORAGE_THRESHOLD = bytes;
      await storageService.reload();
    };
    return { storageService, service, addTorrent, database, setThreshold };
  };

  /**
   * An episode pack of `files` (6 bytes each, pieces of 4, so half the boundaries are shared)
   * written through the real encrypted store, with the storage row and file table recorded.
   */
  const createPack = async (
    ctx: Awaited<ReturnType<typeof setupTest>>,
    options: {
      lengths: number[];
      /** Pieces on disk and in the bitfield; the rest were never downloaded. */
      verifiedPieces?: number;
      completeFiles: number[];
      claims?: Array<{ file: number; kind: 'playback' | 'warmup' | 'watched'; ownerKey: string }>;
    }
  ) => {
    const movie = await factory.createTestMovie();
    const source = await factory.createTestContentSource(movie.id);
    const location = path.join(downloads, source.hash.slice(0, 12));
    await mkdir(location, { recursive: true });
    let offset = 0;
    const layout: EncryptedStorageLayout = {
      storeName: `Show S01 - ${source.hash.slice(0, 8)}`,
      filenameSalt: `download-${source.hash}`,
      pieceLength: PIECE_LENGTH,
      files: options.lengths.map((length, index) => {
        const file = {
          path: `Show/Show.S01E${String(index + 1).padStart(2, '0')}.mkv`,
          length,
          offset,
        };
        offset += length;
        return file;
      }),
    };
    const total = offset;
    const totalPieces = Math.ceil(total / PIECE_LENGTH);
    const verifiedPieces = options.verifiedPieces ?? totalPieces;

    const bytes = Buffer.concat(
      layout.files.map((file, index) =>
        Buffer.alloc(file.length, String.fromCharCode(65 + (index % 26)))
      )
    );
    const writer = new EncryptedChunkStore(PIECE_LENGTH, {
      path: location,
      name: layout.storeName,
      files: layout.files.map(file => ({ ...file })),
      encryptionKey: ENCRYPTION_KEY,
      filenameSalt: layout.filenameSalt,
    });
    try {
      for (let piece = 0; piece < verifiedPieces; piece += 1) {
        await new Promise<void>((resolve, reject) =>
          writer.put(
            piece,
            bytes.subarray(piece * PIECE_LENGTH, (piece + 1) * PIECE_LENGTH),
            error => (error ? reject(error) : resolve())
          )
        );
      }
    } finally {
      await new Promise<void>(resolve => writer.close(() => resolve()));
    }

    const bitfield = new Uint8Array(Math.ceil(totalPieces / 8));
    for (let piece = 0; piece < verifiedPieces; piece += 1)
      bitfield[piece >> 3] |= 0x80 >> (piece & 7);

    const { storageService, database } = ctx;
    const storage = await storageService.createStorage({
      sourceId: source.id,
      location,
      size: total,
      downloadedPieces: bitfield,
      totalPieces,
      pieceLength: PIECE_LENGTH,
      reservedBytes: total,
    });
    await storageService.updateEncryptedLayout(source.id, layout);
    await storageService.recordFiles(source.id, layout);
    await storageService.markFilesComplete(
      source.id,
      options.completeFiles.map(index => layout.files[index].path)
    );
    for (const claim of options.claims ?? []) {
      await storageService.claimFile(
        source.id,
        layout.files[claim.file].path,
        { kind: claim.kind, ownerKey: claim.ownerKey, expiresAt: null },
        true
      );
    }
    // Completed and detached from WebTorrent, as a finished pack would be after seeding.
    const allComplete = options.completeFiles.length === layout.files.length;
    await database.getStorageRepository().update(storage.id, {
      localOnly: allComplete,
      videoCompletedAt: allComplete ? new Date() : null,
    });
    await storageService.reconcileAllocation(source.id);
    return { source, layout, location, storageId: storage.id, totalPieces };
  };

  const readPiece = async (
    location: string,
    layout: EncryptedStorageLayout,
    filePath: string,
    piece: number
  ) => {
    const reader = new EncryptedFileReader(location, layout, filePath, ENCRYPTION_KEY);
    try {
      return (await reader.readPiece(piece)).toString();
    } finally {
      await reader.close();
    }
  };

  const charge = async (storageService: StorageService, sourceId: number) => {
    const row = await storageService.getStorageBySource(sourceId);
    return Math.max(row?.allocatedBytes ?? 0, row?.reservedBytes ?? 0);
  };

  beforeEach(async () => {
    dbHelper = createTestDatabase();
    factory = new TestDataFactory(await dbHelper.setupTestDatabase());
    downloads = await mkdtemp(path.join(os.tmpdir(), 'miauflix-reclaim-it-'));
  });

  afterEach(async () => {
    await dbHelper.cleanup();
    await rm(downloads, { recursive: true, force: true });
  });

  it('reclaims nine completed unclaimed episodes without disturbing the claimed tenth', async () => {
    const ctx = await setupTest();
    const { storageService, addTorrent } = ctx;
    const pack = await createPack(ctx, {
      lengths: Array(10).fill(EPISODE_BYTES),
      // The tenth episode's last piece (14) is still missing.
      verifiedPieces: 14,
      completeFiles: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      claims: [{ file: 9, kind: 'watched', ownerKey: 'user:1:next' }],
    });
    const tenth = pack.layout.files[9].path;
    const chargeBefore = await charge(storageService, pack.source.id);
    expect(await readdir(pack.location)).toHaveLength(10);

    const result = await storageService.reclaimFiles(pack.source.id, 0);

    expect(result.status).toBe('reclaimed');
    // Storage row, directory, the tenth's claim and its encrypted file all survive.
    const storage = await storageService.getStorageBySource(pack.source.id);
    expect(storage).not.toBeNull();
    expect(await readdir(pack.location)).toHaveLength(1);
    expect(await storageService.getClaimedPaths(pack.source.id)).toEqual([tenth]);
    const files = await storageService.getFiles(pack.source.id);
    expect(files).toHaveLength(10);
    expect(files.filter(file => file.completedAt)).toEqual([]);
    // Every piece overlapping the nine episodes is cleared, including the one shared with the tenth.
    expect(Array.from(storage!.downloadedPieces)).toEqual([0, 0]);
    expect(storage!.downloaded).toBe(0);
    expect(storage!.logicalBytes).toBe(EPISODE_BYTES);
    expect(await charge(storageService, pack.source.id)).toBeLessThan(chargeBefore);
    // The tenth is claimed and missing pieces, so the source is reopened and refetched.
    expect(storage!.localOnly).toBe(false);
    expect(storage!.videoCompletedAt).toBeNull();
    expect(addTorrent).toHaveBeenCalledTimes(1);

    // Only once the tenth is released does the next pass remove the whole directory.
    await storageService.releaseClaims(pack.source.id, { path: tenth });
    const final = await storageService.reclaimFiles(pack.source.id, 0);
    expect(final.status).toBe('removed');
    expect(await storageService.getStorageBySource(pack.source.id)).toBeNull();
    await expect(readdir(pack.location)).rejects.toThrow();
  });

  it('keeps a claimed neighbor readable and leaves only the shared boundary piece to refetch', async () => {
    const ctx = await setupTest();
    const { storageService, addTorrent } = ctx;
    // A [0,6) pieces 0-1, B [6,20) pieces 1-4, C [20,26) pieces 5-6; piece 1 is shared by A and B.
    const pack = await createPack(ctx, {
      lengths: [6, 14, 6],
      completeFiles: [0, 1, 2],
      claims: [{ file: 1, kind: 'watched', ownerKey: 'user:1' }],
    });
    const [a, b, c] = pack.layout.files.map(file => file.path);

    const result = await storageService.reclaimFiles(pack.source.id, 0);

    expect(result.status).toBe('reclaimed');
    const storage = await storageService.getStorageBySource(pack.source.id);
    const missing = Array.from({ length: pack.totalPieces }, (_, piece) => piece).filter(
      piece => !isPieceInBitfield(storage!.downloadedPieces, piece)
    );
    // A and C are gone entirely; B lost only its first piece, which A shared.
    expect(missing).toEqual([0, 1, 5, 6]);
    const completion = new Map(
      (await storageService.getFiles(pack.source.id)).map(file => [file.path, file.completedAt])
    );
    expect(completion.get(a)).toBeNull();
    expect(completion.get(b)).toBeNull();
    expect(completion.get(c)).toBeNull();
    // B's fully owned pieces still decrypt to its bytes.
    for (const piece of [2, 3, 4])
      expect(await readPiece(pack.location, pack.layout, b, piece)).toBe('BBBB');
    expect(await readdir(pack.location)).toHaveLength(1);
    // B is now incomplete, so its source reopens to refetch piece 1.
    expect(storage!.localOnly).toBe(false);
    expect(addTorrent).toHaveBeenCalledTimes(1);
  });

  it('does not touch a neighbor under live playback, even if it shares a boundary piece', async () => {
    const ctx = await setupTest();
    const { storageService } = ctx;
    const pack = await createPack(ctx, {
      lengths: [6, 14, 6],
      completeFiles: [0, 1, 2],
      claims: [{ file: 1, kind: 'playback', ownerKey: 'stream' }],
    });

    const result = await storageService.reclaimFiles(pack.source.id, 0);

    // C does not touch B, so it goes; A shares piece 1 with the playing B, so it stays.
    expect(result.status).toBe('reclaimed');
    const completion = new Map(
      (await storageService.getFiles(pack.source.id)).map(file => [file.path, file.completedAt])
    );
    expect(completion.get(pack.layout.files[0].path)).toBeTruthy();
    expect(completion.get(pack.layout.files[1].path)).toBeTruthy();
    expect(completion.get(pack.layout.files[2].path)).toBeNull();
    const storage = await storageService.getStorageBySource(pack.source.id);
    expect(isPieceInBitfield(storage!.downloadedPieces, 1)).toBe(true);
    expect(await readPiece(pack.location, pack.layout, pack.layout.files[0].path, 0)).toBe('AAAA');
  });

  it('refuses to reclaim storage with an active stream', async () => {
    const ctx = await setupTest();
    const { storageService } = ctx;
    const pack = await createPack(ctx, { lengths: [6, 6], completeFiles: [0, 1] });
    await storageService.setPlaybackActive(pack.source.id, true);

    expect((await storageService.reclaimFiles(pack.source.id, 5)).status).toBe('active_playback');
    expect(await readdir(pack.location)).toHaveLength(2);
  });

  it('reclaims a weakly claimed file for admission but keeps a stronger one', async () => {
    const ctx = await setupTest();
    const { storageService } = ctx;
    const pack = await createPack(ctx, {
      lengths: [8, 8, 8],
      completeFiles: [0, 1, 2],
      claims: [
        { file: 0, kind: 'warmup', ownerKey: 'lease:1' },
        { file: 2, kind: 'watched', ownerKey: 'user:1' },
      ],
    });
    const [first, second, third] = pack.layout.files.map(file => file.path);

    // Speculative admission (up to watchlist) may take warmup-claimed and unclaimed files.
    const result = await storageService.reclaimFiles(pack.source.id, 2);

    expect(result.status).toBe('reclaimed');
    expect(await storageService.getClaimedPaths(pack.source.id)).toEqual([third]);
    const completion = new Map(
      (await storageService.getFiles(pack.source.id)).map(file => [file.path, file.completedAt])
    );
    expect(completion.get(first)).toBeNull();
    expect(completion.get(second)).toBeNull();
    expect(completion.get(third)).toBeTruthy();
    // The kept file is aligned to pieces, so it stays complete and nothing is refetched.
    expect(
      (await storageService.getStorageBySource(pack.source.id))?.videoCompletedAt
    ).toBeTruthy();
    expect(await readPiece(pack.location, pack.layout, third, 4)).toBe('CCCC');
  });

  it('frees room for admission file by file instead of evicting the whole storage', async () => {
    const ctx = await setupTest();
    const { storageService, setThreshold } = ctx;
    const pack = await createPack(ctx, {
      lengths: Array(10).fill(EPISODE_BYTES),
      verifiedPieces: 14,
      completeFiles: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      claims: [{ file: 9, kind: 'watched', ownerKey: 'user:1:next' }],
    });
    const used = await charge(storageService, pack.source.id);
    // The new admission only fits once most of the pack is reclaimed.
    await setThreshold(BigInt(used + 20_000));
    const newcomer = await factory.createTestContentSource((await factory.createTestMovie()).id);

    await storageService.createStorage({
      sourceId: newcomer.id,
      location: path.join(downloads, 'newcomer'),
      size: 30_000,
      reservedBytes: 30_000,
      speculative: true,
    });

    expect(await storageService.getStorageBySource(newcomer.id)).not.toBeNull();
    expect(await storageService.getStorageBySource(pack.source.id)).not.toBeNull();
    expect(await storageService.getClaimedPaths(pack.source.id)).toEqual([
      pack.layout.files[9].path,
    ]);
    expect(await readdir(pack.location)).toHaveLength(1);
  });

  it('periodic cleanup reclaims unclaimed files but never deletes the last storage', async () => {
    const ctx = await setupTest();
    const { storageService, setThreshold } = ctx;
    const pack = await createPack(ctx, {
      lengths: Array(10).fill(EPISODE_BYTES),
      verifiedPieces: 14,
      completeFiles: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      claims: [{ file: 9, kind: 'watched', ownerKey: 'user:1:next' }],
    });
    const before = await charge(storageService, pack.source.id);
    await setThreshold(BigInt(before - 1));

    await storageService.cleanup(false);

    expect(await storageService.getStorageBySource(pack.source.id)).not.toBeNull();
    expect(await charge(storageService, pack.source.id)).toBeLessThan(before);
    expect(await readdir(pack.location)).toHaveLength(1);

    // With nothing claimed left it is the last record, so a periodic pass leaves it alone.
    await storageService.releaseClaims(pack.source.id, { path: pack.layout.files[9].path });
    await setThreshold(1n);
    await storageService.cleanup(false);
    expect(await storageService.getStorageBySource(pack.source.id)).not.toBeNull();
    await storageService.cleanup(true);
    expect(await storageService.getStorageBySource(pack.source.id)).toBeNull();
  });

  it('reselects and records files as missing when the deletion fails partway', async () => {
    const ctx = await setupTest();
    const { storageService, service } = ctx;
    const reselect = jest
      .spyOn(
        service as unknown as { reselectAfterReclaim: () => Promise<void> },
        'reselectAfterReclaim'
      )
      .mockResolvedValue();
    const pack = await createPack(ctx, {
      lengths: [6, 14, 6],
      completeFiles: [0, 1, 2],
      claims: [{ file: 1, kind: 'watched', ownerKey: 'user:1' }],
    });
    const original = EncryptedChunkStore.prototype.removeFiles;
    // The first file is deleted, then the disk gives up.
    jest.spyOn(EncryptedChunkStore.prototype, 'removeFiles').mockImplementationOnce(async function (
      this: EncryptedChunkStore,
      paths: string[]
    ) {
      await original.call(this, paths.slice(0, 1));
      throw new Error('disk failure');
    });

    const result = await storageService.reclaimFiles(pack.source.id, 0);

    expect(result.status).toBe('cleanup_failed');
    // Never claim present what may be missing: planned pieces and completions are cleared.
    const storage = await storageService.getStorageBySource(pack.source.id);
    const present = Array.from({ length: pack.totalPieces }, (_, piece) => piece).filter(piece =>
      isPieceInBitfield(storage!.downloadedPieces, piece)
    );
    expect(present).toEqual([2, 3, 4]);
    const files = await storageService.getFiles(pack.source.id);
    expect(files.map(file => file.completedAt)).toEqual([null, null, null]);
    expect(storage!.localOnly).toBe(false);
    expect(storage!.videoCompletedAt).toBeNull();
    // The claimed file is reselected even though the reclaim failed.
    expect(reselect).toHaveBeenCalledTimes(1);
  });

  it('does not reclaim a small completed file that lies inside a kept neighbor pieces', async () => {
    const ctx = await setupTest();
    const { storageService } = ctx;
    // A [0,6) pieces 0-1 (claimed); subtitle [6,8) is only inside piece 1; C [8,14) pieces 2-3.
    const pack = await createPack(ctx, {
      lengths: [6, 2, 6],
      completeFiles: [0, 1, 2],
      claims: [{ file: 0, kind: 'watched', ownerKey: 'user:1' }],
    });
    const [a, subtitle, c] = pack.layout.files.map(file => file.path);

    const result = await storageService.reclaimFiles(pack.source.id, 0);

    expect(result.status).toBe('reclaimed');
    const completion = new Map(
      (await storageService.getFiles(pack.source.id)).map(file => [file.path, file.completedAt])
    );
    expect(completion.get(a)).toBeTruthy();
    expect(completion.get(subtitle)).toBeTruthy();
    expect(completion.get(c)).toBeNull();
    const storage = await storageService.getStorageBySource(pack.source.id);
    expect(isPieceInBitfield(storage!.downloadedPieces, 1)).toBe(true);
    // The neighbor was not churned: the kept file and the subtitle share one encrypted file each.
    expect(await readdir(pack.location)).toHaveLength(2);
  });

  it('ignores a claim on a path the source does not contain', async () => {
    const ctx = await setupTest();
    const { storageService } = ctx;
    const pack = await createPack(ctx, { lengths: [6, 6], completeFiles: [0, 1] });
    await storageService.claimFile(
      pack.source.id,
      'Show/not-in-this-pack.mkv',
      { kind: 'watched', ownerKey: 'user:1', expiresAt: null },
      true
    );

    const result = await storageService.reclaimFiles(pack.source.id, 0);

    // The ghost claim keeps nothing, so the whole storage goes.
    expect(result.status).toBe('removed');
    expect(await storageService.getStorageBySource(pack.source.id)).toBeNull();
  });

  it('finishes admission without waiting for the reselect of a reclaimed source', async () => {
    const ctx = await setupTest();
    const { storageService, service, setThreshold } = ctx;
    let finishReselect!: () => void;
    const reselect = jest
      .spyOn(
        service as unknown as { reselectAfterReclaim: () => Promise<void> },
        'reselectAfterReclaim'
      )
      .mockImplementation(() => new Promise<void>(resolve => (finishReselect = resolve)));
    const pack = await createPack(ctx, {
      lengths: Array(10).fill(EPISODE_BYTES),
      verifiedPieces: 14,
      completeFiles: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      claims: [{ file: 9, kind: 'watched', ownerKey: 'user:1:next' }],
    });
    const used = await charge(storageService, pack.source.id);
    await setThreshold(BigInt(used + 20_000));
    const newcomer = await factory.createTestContentSource((await factory.createTestMovie()).id);

    await storageService.createStorage({
      sourceId: newcomer.id,
      location: path.join(downloads, 'newcomer'),
      size: 30_000,
      reservedBytes: 30_000,
      speculative: true,
    });

    // Admission returned while the reselect is still pending, and the queue is free again.
    expect(reselect).toHaveBeenCalledTimes(1);
    await storageService.reserveStorage(newcomer.id, 30_000, true);
    finishReselect();
  });
});
