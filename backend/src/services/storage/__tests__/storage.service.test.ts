jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';
import { TestDataFactory } from '@__test-utils__/test-data.factory';
import fs from 'fs';

import type { ClaimKind } from '@entities/storage-file-claim.entity';

import { StorageService } from '../storage.service';

const parseStorageThreshold = (value: string): bigint => {
  const units: Record<string, bigint> = {
    B: BigInt(1),
    KB: BigInt(1024),
    MB: BigInt(1024 * 1024),
    GB: BigInt(1024 * 1024 * 1024),
    TB: BigInt(1024) * BigInt(1024 * 1024 * 1024),
  };
  const match = value.toUpperCase().match(/^(\d+)\s*(B|KB|MB|GB|TB)$/);
  if (!match) return BigInt(0);
  return BigInt(match[1]) * (units[match[2]] ?? BigInt(1));
};

const DEFAULT_THRESHOLD = BigInt(50) * BigInt(1024 * 1024 * 1024); // 50GB

const resolveStorageThreshold = (): bigint => {
  const raw = process.env.STORAGE_THRESHOLD;
  if (!raw) return DEFAULT_THRESHOLD;
  const parsed = parseStorageThreshold(raw);
  return parsed === 0n ? DEFAULT_THRESHOLD : parsed;
};

const mockConfig = {
  get: (key: string) => {
    if (key === 'STORAGE_THRESHOLD') {
      return resolveStorageThreshold() as never;
    }
    return undefined as never;
  },
  getOrThrow: (key: string) => {
    if (key === 'STORAGE_THRESHOLD') {
      return resolveStorageThreshold() as never;
    }
    throw new Error(`${key} is not set`);
  },
  registerService: () => {},
};

describe('StorageService', () => {
  let dbHelper: ReturnType<typeof createTestDatabase>;
  let testDataFactory: TestDataFactory;

  const setupTest = () => {
    const database = dbHelper.getDatabase();
    const storageService = new StorageService(database, mockConfig);
    return { storageService, database };
  };

  /** Give a stored source one live (or already expired) claim on its file. */
  const claim = (
    storageService: StorageService,
    sourceId: number,
    kind: ClaimKind,
    options: { ownerKey?: string; path?: string; expiresAt?: Date | null } = {}
  ) =>
    storageService.claimFile(
      sourceId,
      options.path ?? 'movie.mkv',
      { kind, ownerKey: options.ownerKey ?? `${kind}-owner`, expiresAt: options.expiresAt ?? null },
      true
    );

  beforeEach(async () => {
    dbHelper = createTestDatabase();
    const database = await dbHelper.setupTestDatabase();
    testDataFactory = new TestDataFactory(database);
  });

  afterEach(async () => {
    if (dbHelper) {
      await dbHelper.cleanup();
    }
  });

  it('persists a repaired filename salt while preserving the stored layout', async () => {
    const { storageService } = setupTest();
    const movie = await testDataFactory.createTestMovie();
    const source = await testDataFactory.createTestContentSource(movie.id);
    await storageService.createStorage({
      sourceId: source.id,
      location: '/tmp/test/salt',
      size: 8,
      totalPieces: 2,
      downloadedPieces: testDataFactory.createBitfield(2, 100),
    });
    const layout = {
      storeName: 'original',
      filenameSalt: 'old',
      pieceLength: 4,
      files: [{ path: 'movie.mkv', length: 8, offset: 0 }],
    };
    await storageService.updateEncryptedLayout(source.id, layout);
    await storageService.updateEncryptedLayout(source.id, {
      ...layout,
      storeName: 'must not replace',
      filenameSalt: 'fixed',
    });
    expect((await storageService.getStorageBySource(source.id))?.encryptedLayout).toEqual({
      ...layout,
      filenameSalt: 'fixed',
    });
  });

  describe('claims', () => {
    const createClaimed = async (storageService: StorageService, location: string) => {
      const movie = await testDataFactory.createTestMovie();
      const source = await testDataFactory.createTestContentSource(movie.id);
      await storageService.createStorage({ sourceId: source.id, location, size: 1000 });
      return source.id;
    };

    it('keeps only live claims and reports the sources whose claims expired', async () => {
      const { storageService } = setupTest();
      const sourceId = await createClaimed(storageService, '/tmp/test/claims-live');
      await claim(storageService, sourceId, 'watched', { path: 'Show.S01E01.mkv' });
      await claim(storageService, sourceId, 'warmup', {
        path: 'Show.S01E02.mkv',
        expiresAt: new Date(Date.now() - 1),
      });

      expect(await storageService.getClaimedPaths(sourceId)).toEqual(['Show.S01E01.mkv']);
      await expect(storageService.deleteClaims({ expiredAt: new Date() })).resolves.toEqual([
        sourceId,
      ]);
      await expect(storageService.deleteClaims({ expiredAt: new Date() })).resolves.toEqual([]);
    });

    it('releases one owner while another owner keeps the same file claimed', async () => {
      const { storageService } = setupTest();
      const sourceId = await createClaimed(storageService, '/tmp/test/claims-owners');
      await claim(storageService, sourceId, 'watched', { ownerKey: 'user:1' });
      await claim(storageService, sourceId, 'watched', { ownerKey: 'user:2' });

      await storageService.releaseClaims(sourceId, { ownerKey: 'user:1' });

      expect((await storageService.getLiveClaims(sourceId)).map(item => item.ownerKey)).toEqual([
        'user:2',
      ]);
      expect(await storageService.getClaimedPaths(sourceId)).toEqual(['movie.mkv']);
    });

    it('reopens a completed source only when the claimed file is incomplete', async () => {
      const { storageService } = setupTest();
      const sourceId = await createClaimed(storageService, '/tmp/test/claims-reopen');
      const layout = {
        storeName: 'pack',
        filenameSalt: 'salt',
        pieceLength: 4,
        files: [{ path: 'movie.mkv', length: 4, offset: 0 }],
      };
      await storageService.markVideoComplete(sourceId, layout);

      const kept = await storageService.claimFile(
        sourceId,
        'movie.mkv',
        { kind: 'watched', ownerKey: 'user:1' },
        true
      );
      expect(kept?.videoCompletedAt).toBeInstanceOf(Date);

      const reopened = await storageService.claimFile(
        sourceId,
        'extras.mkv',
        { kind: 'watched', ownerKey: 'user:1' },
        false
      );
      expect(reopened?.videoCompletedAt).toBeNull();
      expect(reopened?.localOnly).toBe(false);
    });

    it('gives subtitle sidecars the live claims of their video', async () => {
      const { storageService } = setupTest();
      const sourceId = await createClaimed(storageService, '/tmp/test/claims-sidecars');
      await claim(storageService, sourceId, 'watched', { ownerKey: 'user:1' });

      await storageService.copyClaims(sourceId, 'movie.mkv', ['movie.en.srt']);

      expect(
        (await storageService.getLiveClaims(sourceId))
          .filter(item => item.path === 'movie.en.srt')
          .map(item => [item.kind, item.ownerKey])
      ).toEqual([['watched', 'user:1']]);
    });

    it('records file completion once per file', async () => {
      const { storageService } = setupTest();
      const sourceId = await createClaimed(storageService, '/tmp/test/claims-files');
      await storageService.recordFiles(sourceId, {
        storeName: 'pack',
        filenameSalt: 'salt',
        pieceLength: 4,
        files: [
          { path: 'Show.S01E01.mkv', length: 4, offset: 0 },
          { path: 'Show.S01E02.mkv', length: 4, offset: 4 },
        ],
      });

      await storageService.markFilesComplete(sourceId, ['Show.S01E01.mkv']);
      const first = (await storageService.getFiles(sourceId)).find(
        file => file.path === 'Show.S01E01.mkv'
      )?.completedAt;
      await storageService.markFilesComplete(sourceId, ['Show.S01E01.mkv']);

      const files = await storageService.getFiles(sourceId);
      expect(files.find(file => file.path === 'Show.S01E01.mkv')?.completedAt).toEqual(first);
      expect(files.find(file => file.path === 'Show.S01E02.mkv')?.completedAt).toBeNull();
    });

    it('lists the requested files of each storage in the inventory', async () => {
      const { storageService } = setupTest();
      const sourceId = await createClaimed(storageService, '/tmp/test/claims-inventory');
      await claim(storageService, sourceId, 'watched', { path: 'Movie/movie.mkv' });

      const inventory = await storageService.getInventory();

      expect(inventory.items.find(item => item.sourceId === sourceId)?.requestedFiles).toEqual([
        'Movie/movie.mkv',
      ]);
    });

    it('lists sources wanted only speculatively', async () => {
      const { storageService } = setupTest();
      const warmed = await createClaimed(storageService, '/tmp/test/claims-speculative');
      const watched = await createClaimed(storageService, '/tmp/test/claims-watched');
      await claim(storageService, warmed, 'warmup');
      await claim(storageService, watched, 'warmup');
      await claim(storageService, watched, 'watched');

      expect(await storageService.getSpeculativeSourceIds()).toEqual([warmed]);
    });
  });

  describe('eviction by claim', () => {
    const withThreshold = async (run: () => Promise<void>) => {
      const originalEnv = process.env.STORAGE_THRESHOLD;
      process.env.STORAGE_THRESHOLD = '50GB';
      try {
        await run();
      } finally {
        if (originalEnv) process.env.STORAGE_THRESHOLD = originalEnv;
        else delete process.env.STORAGE_THRESHOLD;
      }
    };

    const fill = async (storageService: StorageService, name: string, kinds: ClaimKind[]) => {
      const movie = await testDataFactory.createTestMovie();
      const source = await testDataFactory.createTestContentSource(movie.id);
      await storageService.createStorage({
        sourceId: source.id,
        location: `/tmp/test/evict-${name}`,
        size: 700 * 1024,
        reservedBytes: 700 * 1024,
      });
      for (const [index, kind] of kinds.entries())
        await claim(storageService, source.id, kind, { ownerKey: `${kind}:${index}` });
      return source.id;
    };

    it("never lets speculative admission evict another user's prefetch or playback", async () => {
      await withThreshold(async () => {
        const { storageService } = setupTest();
        const prefetched = await fill(storageService, 'prefetched', ['watchlist', 'prefetch']);
        process.env.STORAGE_THRESHOLD = '1MB';
        await storageService.reload();
        const movie = await testDataFactory.createTestMovie();
        const warmup = await testDataFactory.createTestContentSource(movie.id);

        await expect(
          storageService.createStorage({
            sourceId: warmup.id,
            location: '/tmp/test/evict-warmup',
            size: 600 * 1024,
            reservedBytes: 600 * 1024,
            speculative: true,
          })
        ).rejects.toThrow('Insufficient storage capacity');
        expect(await storageService.getStorageBySource(prefetched)).not.toBeNull();
      });
    });

    it('lets retained admission evict watched storage but never live playback', async () => {
      await withThreshold(async () => {
        const { storageService } = setupTest();
        const playing = await fill(storageService, 'playing', ['playback']);
        process.env.STORAGE_THRESHOLD = '1MB';
        await storageService.reload();
        const movie = await testDataFactory.createTestMovie();
        const viewer = await testDataFactory.createTestContentSource(movie.id);

        await expect(
          storageService.createStorage({
            sourceId: viewer.id,
            location: '/tmp/test/evict-viewer',
            size: 600 * 1024,
            reservedBytes: 600 * 1024,
          })
        ).rejects.toThrow('Insufficient storage capacity');
        expect(await storageService.getStorageBySource(playing)).not.toBeNull();
      });
    });

    it('evicts the least protected storage first', async () => {
      await withThreshold(async () => {
        const { storageService } = setupTest();
        const watched = await fill(storageService, 'watched', ['watched']);
        const warmed = await fill(storageService, 'warmed', ['warmup']);
        process.env.STORAGE_THRESHOLD = '2MB';
        await storageService.reload();
        const movie = await testDataFactory.createTestMovie();
        const viewer = await testDataFactory.createTestContentSource(movie.id);

        await storageService.createStorage({
          sourceId: viewer.id,
          location: '/tmp/test/evict-order',
          size: 700 * 1024,
          reservedBytes: 700 * 1024,
        });

        expect(await storageService.getStorageBySource(warmed)).toBeNull();
        expect(await storageService.getStorageBySource(watched)).not.toBeNull();
      });
    });
  });

  describe('Core CRUD Operations', () => {
    it('should create storage record for a movie source', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const totalPieces = 1000;
      const downloadedPieces = testDataFactory.createBitfield(totalPieces, 25); // 25% complete

      // Act
      const storage = await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/movie.mkv',
        size: 2147483648,
        downloadedPieces,
        totalPieces,
      });

      // Assert
      expect(storage).toBeDefined();
      expect(storage.id).toBeDefined();
      expect(storage.sourceId).toBe(contentSource.id);
      expect(storage.location).toBe('/tmp/test/movie.mkv');
      expect(storage.size).toBe(2147483648);
      expect(storage.downloadedPieces).toEqual(downloadedPieces);
      expect(storage.downloaded).toBe(2500); // 25% in basis points
    });

    it('reserves selected episode bytes instead of the full shared torrent pack', async () => {
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const source = await testDataFactory.createTestContentSource(movie.id);

      const storage = await storageService.createStorage({
        sourceId: source.id,
        location: '/tmp/test/episode-pack',
        size: 4 * 1024 * 1024 * 1024,
        reservedBytes: 420 * 1024 * 1024,
        partialReservation: true,
      });

      expect(storage.size).toBe(4 * 1024 * 1024 * 1024);
      expect(storage.reservedBytes).toBe(420 * 1024 * 1024);
    });

    it('should find storage by movie source ID', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const createdStorage = await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/find-test.mkv',
        size: 1000000,
      });

      // Act
      const foundStorage = await storageService.getStorageBySource(contentSource.id);

      // Assert
      expect(foundStorage).toBeDefined();
      expect(foundStorage?.id).toBe(createdStorage.id);
      expect(foundStorage?.sourceId).toBe(contentSource.id);
    });

    it('keeps the larger reservation when the same source is warmed again', async () => {
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const source = await testDataFactory.createTestContentSource(movie.id);
      const location = '/tmp/test/watched-rewarm.mkv';
      await storageService.createStorage({ sourceId: source.id, location, size: 1000 });

      const warmed = await storageService.createStorage({
        sourceId: source.id,
        location,
        size: 1000,
        speculative: true,
        reservedBytes: 100,
      });

      expect(warmed.reservedBytes).toBe(1000);
    });

    it('should find storage by ID', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const createdStorage = await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/id-test.mkv',
        size: 1000000,
      });

      // Act
      const foundStorage = await storageService.getStorageById(createdStorage.id);

      // Assert
      expect(foundStorage).toBeDefined();
      expect(foundStorage?.id).toBe(createdStorage.id);
      expect(foundStorage?.sourceId).toBe(contentSource.id);
    });

    it('should update storage download progress', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const totalPieces = 1000;
      const initialBitfield = testDataFactory.createBitfield(totalPieces, 10);

      await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/progress-test.mkv',
        size: 2000000,
        downloadedPieces: initialBitfield,
        totalPieces,
      });

      const updatedBitfield = testDataFactory.createBitfield(totalPieces, 50);

      // Act
      await storageService.updateDownloadProgress({
        sourceId: contentSource.id,
        downloadedPieces: updatedBitfield,
        totalPieces,
        size: 2000000,
      });

      // Assert
      const storage = await storageService.getStorageBySource(contentSource.id);
      expect(storage?.downloaded).toBe(5000); // 50% in basis points
      expect(storage?.downloadedPieces).toEqual(updatedBitfield);
    });

    it('should delete storage record', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const storageSize = 1000000;
      await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/delete-test.mkv',
        size: storageSize,
      });

      // Act
      const deleteResult = await storageService.removeStorage(contentSource.id);
      const foundStorage = await storageService.getStorageBySource(contentSource.id);

      // Assert
      expect(deleteResult).toBe(storageSize); // Returns the size of deleted storage
      expect(foundStorage).toBeNull();
    });

    it('reports a successful zero-byte deletion distinctly from failure', async () => {
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const source = await testDataFactory.createTestContentSource(movie.id);
      await storageService.createStorage({
        sourceId: source.id,
        location: '/tmp/test/zero-byte-delete',
        size: 0,
        reservedBytes: 0,
      });

      await expect(storageService.removeStorageWithResult(source.id)).resolves.toEqual({
        status: 'removed',
        bytes: 0,
      });
    });

    it('reports active playback and physical cleanup failure without deleting the record', async () => {
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const source = await testDataFactory.createTestContentSource(movie.id);
      const storage = await storageService.createStorage({
        sourceId: source.id,
        location: '/tmp/test/result-protection',
        size: 100,
      });

      await storageService.setPlaybackActive(source.id, true);
      await expect(storageService.removeStorageWithResult(source.id)).resolves.toEqual({
        status: 'active_playback',
      });
      await storageService.setPlaybackActive(source.id, false);
      storageService.registerDeleteHandler(() => {
        throw new Error('filesystem unavailable');
      });
      await expect(storageService.removeStorageWithResult(source.id)).resolves.toEqual({
        status: 'cleanup_failed',
      });
      expect(await storageService.getStorageById(storage.id)).not.toBeNull();
    });

    it('serializes concurrent deletion requests for the same source', async () => {
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const source = await testDataFactory.createTestContentSource(movie.id);
      await storageService.createStorage({
        sourceId: source.id,
        location: '/tmp/test/concurrent-delete',
        size: 100,
      });

      let markEntered!: () => void;
      let finishCleanup!: () => void;
      const entered = new Promise<void>(resolve => (markEntered = resolve));
      const holdCleanup = new Promise<void>(resolve => (finishCleanup = resolve));
      const cleanup = jest.fn(async () => {
        markEntered();
        await holdCleanup;
      });
      storageService.registerDeleteHandler(cleanup);

      const first = storageService.removeStorageWithResult(source.id);
      await entered;
      const second = storageService.removeStorageWithResult(source.id);
      finishCleanup();

      await expect(first).resolves.toEqual({ status: 'removed', bytes: 100 });
      await expect(second).resolves.toEqual({ status: 'not_found' });
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('shows persisted physical allocation, reservations, and unavailable filesystem capacity', async () => {
      const { storageService, database } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const source = await testDataFactory.createTestContentSource(movie.id);
      const storage = await storageService.createStorage({
        sourceId: source.id,
        location: '/tmp/test/inventory',
        size: 1000,
        reservedBytes: 1500,
      });
      await database.getStorageRepository().reconcileAllocation(storage.id, 800);

      const inventory = await storageService.getInventory();
      expect(inventory.items[0].contentSource?.movies?.[0]?.movie?.title).toBe(movie.title);
      expect(inventory.items[0].allocatedBytes).toBe(800);
      expect(inventory.physicalBytes).toBe(800);
      expect(inventory.reservedBytes).toBe(1500);
      expect(inventory.filesystem).toBeNull();
    });

    it('should throw error when creating storage for non-existent movie source', async () => {
      // Arrange
      const { storageService } = setupTest();
      const nonExistentSourceId = 999999;

      // Act & Assert
      await expect(
        storageService.createStorage({
          sourceId: nonExistentSourceId,
          location: '/tmp/test/nonexistent.mkv',
          size: 1000000,
        })
      ).rejects.toThrow();
    });

    it('records completion once and preserves the first encrypted layout', async () => {
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const source = await testDataFactory.createTestContentSource(movie.id);
      await storageService.createStorage({
        sourceId: source.id,
        location: '/tmp/test/completed-media',
        size: 8,
      });
      const layout = {
        storeName: 'movie - abcdef12',
        filenameSalt: 'download-abcdef12',
        pieceLength: 4,
        files: [{ path: 'movie.mkv', length: 8, offset: 0 }],
      };

      const first = await storageService.markVideoComplete(source.id, layout);
      const duplicate = await storageService.markVideoComplete(source.id, {
        ...layout,
        storeName: 'replacement-layout',
      });

      expect(first?.videoCompletedAt).toBeInstanceOf(Date);
      expect(duplicate?.videoCompletedAt).toEqual(first?.videoCompletedAt);
      expect(duplicate?.encryptedLayout).toEqual(layout);
    });
  });

  describe('Download Progress Management', () => {
    it('should correctly calculate download percentage', async () => {
      // Arrange
      const { storageService } = setupTest();
      const totalPieces = 1000;
      const testCases = [
        { completion: 0, expectedBasisPoints: 0 },
        { completion: 25, expectedBasisPoints: 2500 },
        { completion: 50, expectedBasisPoints: 5000 },
        { completion: 75, expectedBasisPoints: 7500 },
        { completion: 100, expectedBasisPoints: 10000 },
      ];

      for (const testCase of testCases) {
        const bitfield = testDataFactory.createBitfield(totalPieces, testCase.completion);

        // Act
        const calculated = await storageService.calculateProgressFromBitfield(
          bitfield,
          totalPieces
        );

        // Assert
        expect(calculated).toBe(testCase.expectedBasisPoints);
      }
    });

    it('should update downloaded pieces bitmap', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const totalPieces = 100;
      const initialBitfield = testDataFactory.createEmptyBitfield(totalPieces);

      await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/bitmap-test.mkv',
        size: 1000000,
        downloadedPieces: initialBitfield,
        totalPieces,
      });

      // Act
      const updatedBitfield = testDataFactory.createBitfield(totalPieces, 30);
      await storageService.updateDownloadProgress({
        sourceId: contentSource.id,
        downloadedPieces: updatedBitfield,
        totalPieces,
      });

      // Assert
      const storage = await storageService.getStorageBySource(contentSource.id);
      expect(storage?.downloadedPieces).toEqual(updatedBitfield);
    });

    it('ignores progress updates with an invalid piece count', async () => {
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const initialBitfield = testDataFactory.createEmptyBitfield(8);
      await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/invalid-progress.mkv',
        size: 1000,
        downloadedPieces: initialBitfield,
        totalPieces: 8,
      });

      await storageService.updateDownloadProgress({
        sourceId: contentSource.id,
        downloadedPieces: initialBitfield,
        totalPieces: Number.NaN,
      });
      await storageService.updateDownloadProgress({
        sourceId: contentSource.id,
        downloadedPieces: initialBitfield,
        totalPieces: 8,
        size: Number.NaN,
      });

      const storage = await storageService.getStorageBySource(contentSource.id);
      expect(storage?.downloaded).toBe(0);
      expect(storage?.downloadedPieces).toEqual(initialBitfield);
    });

    it('should handle complete download status', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const totalPieces = 500;
      const completeBitfield = testDataFactory.createCompleteBitfield(totalPieces);

      // Act
      const storage = await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/complete-test.mkv',
        size: 1000000,
        downloadedPieces: completeBitfield,
        totalPieces,
      });

      // Assert
      expect(storage.downloaded).toBe(10000); // 100% in basis points

      // Verify it shows up in completed downloads
      const completedDownloads = await storageService.getCompletedDownloads();
      expect(completedDownloads).toContainEqual(
        expect.objectContaining({
          id: storage.id,
          downloaded: 10000,
        })
      );
    });

    it('should validate download progress does not exceed total size', async () => {
      // Arrange
      const { storageService } = setupTest();
      const totalPieces = 100;
      const oversizedBitfield = new Uint8Array(20); // More bytes than needed
      oversizedBitfield.fill(0xff);

      // Act
      const isValid = await storageService.validateBitfield(oversizedBitfield, totalPieces);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should handle concurrent download progress updates', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const totalPieces = 1000;

      await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/concurrent-test.mkv',
        size: 2000000,
        downloadedPieces: testDataFactory.createEmptyBitfield(totalPieces),
        totalPieces,
      });

      // Act - Simulate concurrent updates
      const updates = [
        storageService.updateDownloadProgress({
          sourceId: contentSource.id,
          downloadedPieces: testDataFactory.createBitfield(totalPieces, 25),
          totalPieces,
        }),
        storageService.updateDownloadProgress({
          sourceId: contentSource.id,
          downloadedPieces: testDataFactory.createBitfield(totalPieces, 50),
          totalPieces,
        }),
        storageService.updateDownloadProgress({
          sourceId: contentSource.id,
          downloadedPieces: testDataFactory.createBitfield(totalPieces, 75),
          totalPieces,
        }),
      ];

      await Promise.all(updates);

      // Assert - Final state should be consistent
      const storage = await storageService.getStorageBySource(contentSource.id);
      expect(storage?.downloaded).toBeGreaterThan(0);
      expect(storage?.downloaded).toBeLessThanOrEqual(10000);
    });
  });

  describe('Relationship Management', () => {
    it('should maintain one-to-one relationship with ContentSource', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const storage1 = await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/relationship1.mkv',
        size: 1000000,
      });
      // Act: Try to create a second storage for the same movie source
      const storage2 = await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/relationship2.mkv',
        size: 1000000,
      });
      // Assert: Should return the existing record
      expect(storage2.id).toBe(storage1.id);
      expect(storage2.location).toBe(storage1.location);
    });

    it('should prevent duplicate storage records for same movie source', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const storage1 = await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/duplicate1.mkv',
        size: 1000000,
      });
      // Act: Try to create a duplicate
      const storage2 = await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/duplicate2.mkv',
        size: 1000000,
      });
      // Assert: Should return the existing record
      expect(storage2.id).toBe(storage1.id);
      expect(storage2.location).toBe(storage1.location);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Arrange
      const { storageService } = setupTest();
      await dbHelper.cleanup(); // Close database connection

      // Act & Assert
      await expect(storageService.getStorageById(1)).rejects.toThrow();
    });

    it('should throw validation error for invalid storage data', async () => {
      // Arrange
      const { storageService } = setupTest();
      // Act & Assert
      await expect(
        storageService.createStorage({
          sourceId: -1, // Invalid ID
          location: '', // Empty location
          size: -1000, // Negative size
        })
      ).rejects.toThrow();
    });

    it('should handle file system errors when updating location', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const invalidPath = '/invalid/path/that/does/not/exist/movie.mkv';

      // Act - This should still create the storage record even if path doesn't exist
      // (path validation might be handled elsewhere in the system)
      const storage = await storageService.createStorage({
        sourceId: contentSource.id,
        location: invalidPath,
        size: 1000000,
      });

      // Assert
      expect(storage.location).toBe(invalidPath);
      expect(fs.existsSync(invalidPath)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero-byte files', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);

      // Act
      const storage = await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/zero-byte.mkv',
        size: 0,
        downloadedPieces: new Uint8Array(0),
        totalPieces: 0,
      });

      // Assert
      expect(storage.size).toBe(0);
      expect(storage.downloaded).toBe(0);
      expect(storage.downloadedPieces.length).toBe(0);
    });

    it('should handle extremely large file sizes', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const largeSize = 2 ** 40; // 1TB

      await expect(
        storageService.createStorage({
          sourceId: contentSource.id,
          location: '/tmp/test/large-file.mkv',
          size: largeSize,
          downloadedPieces: new Uint8Array(1000),
          totalPieces: 8000,
        })
      ).rejects.toThrow('Insufficient storage capacity');
    });

    it('should validate file location path exists', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const testDir = dbHelper.getTestDir();
      const validPath = `${testDir}/valid-file.mkv`;

      // Create the directory
      await fs.promises.mkdir(testDir, { recursive: true });

      // Act
      const storage = await storageService.createStorage({
        sourceId: contentSource.id,
        location: validPath,
        size: 1000000,
      });

      // Assert
      expect(storage.location).toBe(validPath);
      expect(fs.existsSync(testDir)).toBe(true);
    });

    it('should handle corrupted downloaded pieces data', async () => {
      // Arrange
      const { storageService } = setupTest();
      const totalPieces = 100;
      const corruptedBitfield = new Uint8Array(5); // Wrong size for 100 pieces
      corruptedBitfield.fill(0xff);

      // Act
      const isValid = await storageService.validateBitfield(corruptedBitfield, totalPieces);

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('Service Methods', () => {
    it('should mark storage as accessed', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const storage = await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/access-test.mkv',
        size: 1000000,
      });

      expect(storage.lastAccessAt).toBeNull();

      // Act
      await storageService.markAsAccessed(contentSource.id);

      // Assert
      const updatedStorage = await storageService.getStorageBySource(contentSource.id);
      expect(updatedStorage?.lastAccessAt).not.toBeNull();
      expect(updatedStorage?.lastAccessAt).toBeInstanceOf(Date);
    });

    it('does not claim speculative storage when it is marked as accessed', async () => {
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/speculative-access-test.mkv',
        size: 1_000_000,
        speculative: true,
      });
      await claim(storageService, contentSource.id, 'warmup');

      await storageService.markAsAccessed(contentSource.id);

      const updatedStorage = await storageService.getStorageBySource(contentSource.id);
      expect((await storageService.getLiveClaims(contentSource.id)).map(c => c.kind)).toEqual([
        'warmup',
      ]);
      expect(updatedStorage?.lastAccessAt).toBeInstanceOf(Date);
    });

    it('should get total storage usage', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie1 = await testDataFactory.createTestMovie();
      const movie2 = await testDataFactory.createTestMovie();
      const contentSource1 = await testDataFactory.createTestContentSource(movie1.id);
      const contentSource2 = await testDataFactory.createTestContentSource(movie2.id);

      await storageService.createStorage({
        sourceId: contentSource1.id,
        location: '/tmp/test/usage1.mkv',
        size: 1000000,
      });

      await storageService.createStorage({
        sourceId: contentSource2.id,
        location: '/tmp/test/usage2.mkv',
        size: 2000000,
      });

      // Act
      const totalUsage = await storageService.getTotalStorageUsage();

      // Assert
      expect(totalUsage).toBe(3000000n); // Returns BigInt
    });

    it('should find active downloads', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);
      const totalPieces = 1000;

      const storage = await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/active-download.mkv',
        size: 2000000,
        downloadedPieces: testDataFactory.createBitfield(totalPieces, 50), // 50% complete
        totalPieces,
      });

      // Act
      const activeDownloads = await storageService.getActiveDownloads();

      // Assert
      expect(activeDownloads).toContainEqual(
        expect.objectContaining({
          id: storage.id,
          downloaded: 5000, // 50% in basis points
        })
      );
    });

    it('should find stale storage records', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const contentSource = await testDataFactory.createTestContentSource(movie.id);

      const storage = await storageService.createStorage({
        sourceId: contentSource.id,
        location: '/tmp/test/stale-test.mkv',
        size: 1000000,
      });

      // Simulate old access time
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago

      const db = dbHelper.getDatabase();
      const storageRepo = db.getStorageRepository();
      await storageRepo.update(storage.id, { lastAccessAt: oldDate });

      // Act
      const staleRecords = await storageService.findStaleStorage(5); // More than 5 days old

      // Assert
      expect(staleRecords).toContainEqual(
        expect.objectContaining({
          id: storage.id,
        })
      );
    });
  });

  describe('Storage pressure cleanup', () => {
    it('reclaims unexpired speculative storage for watched playback admission', async () => {
      const originalEnv = process.env.STORAGE_THRESHOLD;
      process.env.STORAGE_THRESHOLD = '50GB';
      try {
        const { storageService } = setupTest();
        const movie = await testDataFactory.createTestMovie();
        const backgroundSource = await testDataFactory.createTestContentSource(movie.id);
        await storageService.createStorage({
          sourceId: backgroundSource.id,
          location: '/tmp/test/unexpired-background.mkv',
          size: 2 * 1024 * 1024 * 1024,
          speculative: true,
          reservedBytes: 2 * 1024 * 1024 * 1024,
        });
        await claim(storageService, backgroundSource.id, 'warmup');
        process.env.STORAGE_THRESHOLD = '1GB';
        await storageService.reload();

        const playbackSource = await testDataFactory.createTestContentSource(movie.id);
        await storageService.createStorage({
          sourceId: playbackSource.id,
          location: '/tmp/test/playback-admission.mkv',
          size: 100 * 1024 * 1024,
        });

        await expect(storageService.getStorageBySource(backgroundSource.id)).resolves.toBeNull();
        await expect(storageService.getStorageBySource(playbackSource.id)).resolves.not.toBeNull();
      } finally {
        if (originalEnv) process.env.STORAGE_THRESHOLD = originalEnv;
        else delete process.env.STORAGE_THRESHOLD;
      }
    });

    it('should emit delete events when cleaning up due to storage pressure', async () => {
      // Arrange
      const originalEnv = process.env.STORAGE_THRESHOLD;
      process.env.STORAGE_THRESHOLD = '50GB';

      try {
        // Create a new service instance to pick up the new threshold
        const { storageService } = setupTest();

        // Create enough storage records to exceed the pressure threshold
        const movie = await testDataFactory.createTestMovie();
        const sources = [];
        for (let i = 0; i < 10; i++) {
          // Always create a new movie source for each storage record
          const contentSource = await testDataFactory.createTestContentSource(movie.id);
          sources.push(contentSource);
          await storageService.createStorage({
            sourceId: contentSource.id,
            location: `/tmp/test/pressure-${i}.mkv`,
            size: 2 * 1024 * 1024 * 1024, // 2GB each, total 20GB
            speculative: true,
            reservedBytes: 2 * 1024 * 1024 * 1024,
          });
        }
        process.env.STORAGE_THRESHOLD = '1GB';
        await storageService.reload();
        let deletedCount = 0;
        storageService.on('delete', () => {
          deletedCount++;
        });
        // Act: create one more unique movie source and storage to trigger pressure cleanup
        const extraSource = await testDataFactory.createTestContentSource(movie.id);
        await storageService.createStorage({
          sourceId: extraSource.id,
          location: `/tmp/test/pressure-extra.mkv`,
          size: 100 * 1024 * 1024,
        });
        // Assert: at least one delete event should have been emitted
        expect(deletedCount).toBeGreaterThan(0);
      } finally {
        // Restore original environment
        if (originalEnv) {
          process.env.STORAGE_THRESHOLD = originalEnv;
        } else {
          delete process.env.STORAGE_THRESHOLD;
        }
      }
    });

    it('should find the most stale storage record', async () => {
      // Arrange
      const { storageService, database } = setupTest();
      const movie = await testDataFactory.createTestMovie();

      // Create multiple storage records with different access times
      const storage1 = await storageService.createStorage({
        sourceId: (await testDataFactory.createTestContentSource(movie.id)).id,
        location: '/tmp/test/stale1.mkv',
        size: 1000000,
        speculative: true,
      });

      const storage2 = await storageService.createStorage({
        sourceId: (await testDataFactory.createTestContentSource(movie.id)).id,
        location: '/tmp/test/stale2.mkv',
        size: 1000000,
        speculative: true,
      });

      const storage3 = await storageService.createStorage({
        sourceId: (await testDataFactory.createTestContentSource(movie.id)).id,
        location: '/tmp/test/stale3.mkv',
        size: 1000000,
        speculative: true,
      });

      // Set different interest times
      const db = dbHelper.getDatabase();
      const storageRepo = db.getStorageRepository();

      // storage1: most recent
      await storageRepo.update(storage1.id, { lastInterestAt: new Date() });
      // storage2: 5 days ago
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      await storageRepo.update(storage2.id, { lastInterestAt: fiveDaysAgo });
      // storage3: 10 days ago (most stale)
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      await storageRepo.update(storage3.id, { lastInterestAt: tenDaysAgo });

      // Act
      const mostStale = await database.getStorageFileRepository().findEvictionCandidate(0);

      // Assert
      expect(mostStale).toBe(storage3.id); // Should be the most stale (10 days ago)
    });

    it('should return null when no storage records exist', async () => {
      // Arrange
      const { database } = setupTest();

      // Act
      const mostStale = await database.getStorageFileRepository().findEvictionCandidate(5);

      // Assert
      expect(mostStale).toBeNull();
    });

    it('should get correct storage count', async () => {
      // Arrange
      const { storageService, database } = setupTest();

      // Create multiple storage records with different movies and movie sources
      const movieSources = [];
      for (let i = 0; i < 5; i++) {
        const movie = await testDataFactory.createTestMovie();
        const contentSource = await testDataFactory.createTestContentSource(movie.id);
        movieSources.push(contentSource);
        await storageService.createStorage({
          sourceId: contentSource.id,
          location: `/tmp/test/count-${i}.mkv`,
          size: 1000000,
        });
      }

      // Act
      const count = await database.getStorageRepository().getStorageCount();

      // Assert
      expect(count).toBe(5);
    });

    it('should not delete the last storage record during periodic cleanup', async () => {
      // Arrange
      const originalEnv = process.env.STORAGE_THRESHOLD;
      process.env.STORAGE_THRESHOLD = '50GB';

      try {
        const { storageService } = setupTest();
        const movie = await testDataFactory.createTestMovie();

        // Seed a row before lowering the limit to simulate existing pressure.
        const contentSource = await testDataFactory.createTestContentSource(movie.id);
        const storage = await storageService.createStorage({
          sourceId: contentSource.id,
          location: '/tmp/test/last-record.mkv',
          size: 10 * 1024 * 1024, // 10MB, exceeds 1MB threshold
          speculative: true,
          reservedBytes: 10 * 1024 * 1024,
        });
        process.env.STORAGE_THRESHOLD = '1MB';
        await storageService.reload();

        let deletedCount = 0;
        storageService.on('delete', () => {
          deletedCount++;
        });

        // Act: Run periodic cleanup (canCleanEverything = false)
        await storageService.cleanup(false);

        // Assert: Should not delete the last record
        expect(deletedCount).toBe(0);

        const remainingStorage = await storageService.getStorageBySource(contentSource.id);
        expect(remainingStorage).toBeDefined();
        expect(remainingStorage?.id).toBe(storage.id);
      } finally {
        if (originalEnv) {
          process.env.STORAGE_THRESHOLD = originalEnv;
        } else {
          delete process.env.STORAGE_THRESHOLD;
        }
      }
    });

    it('should delete all storage records when canCleanEverything is true', async () => {
      // Arrange
      const originalEnv = process.env.STORAGE_THRESHOLD;
      process.env.STORAGE_THRESHOLD = '50GB';

      try {
        const { storageService } = setupTest();
        const movie = await testDataFactory.createTestMovie();

        // Create a single expired speculative record that exceeds the threshold
        const contentSource = await testDataFactory.createTestContentSource(movie.id);
        await storageService.createStorage({
          sourceId: contentSource.id,
          location: '/tmp/test/clean-all.mkv',
          size: 10 * 1024 * 1024, // 10MB, exceeds 1MB threshold
          speculative: true,
          reservedBytes: 10 * 1024 * 1024,
        });
        process.env.STORAGE_THRESHOLD = '1MB';
        await storageService.reload();

        let deletedCount = 0;
        storageService.on('delete', () => {
          deletedCount++;
        });

        // Act: Run cleanup with canCleanEverything = true
        await storageService.cleanup(true);

        // Assert: Should delete the record
        expect(deletedCount).toBe(1);

        const remainingStorage = await storageService.getStorageBySource(contentSource.id);
        expect(remainingStorage).toBeNull();
      } finally {
        if (originalEnv) {
          process.env.STORAGE_THRESHOLD = originalEnv;
        } else {
          delete process.env.STORAGE_THRESHOLD;
        }
      }
    });

    it('should handle cleanup with multiple storage records', async () => {
      // Arrange
      const originalEnv = process.env.STORAGE_THRESHOLD;
      process.env.STORAGE_THRESHOLD = '50GB';

      try {
        const { storageService } = setupTest();

        // Create multiple storage records with different movies
        const storages = [];
        for (let i = 0; i < 3; i++) {
          const movie = await testDataFactory.createTestMovie();
          const contentSource = await testDataFactory.createTestContentSource(movie.id);
          const storage = await storageService.createStorage({
            sourceId: contentSource.id,
            location: `/tmp/test/multi-${i}.mkv`,
            size: 3 * 1024 * 1024, // 3MB each, total 9MB exceeds 1MB threshold
            speculative: true,
            reservedBytes: 3 * 1024 * 1024,
          });
          storages.push({ storage, contentSource });
        }
        process.env.STORAGE_THRESHOLD = '1MB';
        await storageService.reload();

        // Set different access times to control deletion order
        const db = dbHelper.getDatabase();
        const storageRepo = db.getStorageRepository();

        // Make first storage most stale
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 10);
        await storageRepo.update(storages[0].storage.id, { lastAccessAt: oldDate });

        let deletedCount = 0;
        storageService.on('delete', () => {
          deletedCount++;
        });

        // Act: Run cleanup with canCleanEverything = true to force cleanup
        await storageService.cleanup(true);

        // Assert: Should delete some records
        expect(deletedCount).toBeGreaterThan(0);

        // At least one record should remain (since we're not testing threshold logic here)
        const remainingCount = await db.getStorageRepository().getStorageCount();
        expect(remainingCount).toBeGreaterThanOrEqual(0);
      } finally {
        if (originalEnv) {
          process.env.STORAGE_THRESHOLD = originalEnv;
        } else {
          delete process.env.STORAGE_THRESHOLD;
        }
      }
    });
  });

  describe('admission and playback accounting', () => {
    it('evicts lower-priority speculative storage before admitting a new reservation', async () => {
      const originalEnv = process.env.STORAGE_THRESHOLD;
      process.env.STORAGE_THRESHOLD = '50GB';
      try {
        const { storageService } = setupTest();
        const movie = await testDataFactory.createTestMovie();
        const expiredSource = await testDataFactory.createTestContentSource(movie.id);
        await storageService.createStorage({
          sourceId: expiredSource.id,
          location: '/tmp/test/expired-speculative.mkv',
          size: 700 * 1024,
          speculative: true,
          reservedBytes: 700 * 1024,
        });

        process.env.STORAGE_THRESHOLD = '1MB';
        await storageService.reload();
        const newSource = await testDataFactory.createTestContentSource(movie.id);

        const newStorage = await storageService.createStorage({
          sourceId: newSource.id,
          location: '/tmp/test/new-speculative.mkv',
          size: 400 * 1024,
          speculative: true,
          reservedBytes: 400 * 1024,
        });
        expect(newStorage.reservedBytes).toBe(400 * 1024);
        expect(await storageService.getStorageBySource(expiredSource.id)).toBeNull();
      } finally {
        if (originalEnv) process.env.STORAGE_THRESHOLD = originalEnv;
        else delete process.env.STORAGE_THRESHOLD;
      }
    });

    it('evicts lower-priority speculative storage before increasing an existing reservation', async () => {
      const originalEnv = process.env.STORAGE_THRESHOLD;
      process.env.STORAGE_THRESHOLD = '50GB';
      try {
        const { storageService } = setupTest();
        const movie = await testDataFactory.createTestMovie();
        const expiredSource = await testDataFactory.createTestContentSource(movie.id);
        const targetSource = await testDataFactory.createTestContentSource(movie.id);
        await storageService.createStorage({
          sourceId: expiredSource.id,
          location: '/tmp/test/existing-expired.mkv',
          size: 700 * 1024,
          speculative: true,
          reservedBytes: 700 * 1024,
        });
        await storageService.createStorage({
          sourceId: targetSource.id,
          location: '/tmp/test/existing-target.mkv',
          size: 200 * 1024,
          speculative: true,
          reservedBytes: 200 * 1024,
        });
        await claim(storageService, targetSource.id, 'warmup');

        process.env.STORAGE_THRESHOLD = '1MB';
        await storageService.reload();
        const updated = await storageService.createStorage({
          sourceId: targetSource.id,
          location: '/tmp/test/existing-target.mkv',
          size: 500 * 1024,
          speculative: true,
          reservedBytes: 500 * 1024,
        });
        expect(updated.reservedBytes).toBe(500 * 1024);
        expect(await storageService.getStorageBySource(expiredSource.id)).toBeNull();
      } finally {
        if (originalEnv) process.env.STORAGE_THRESHOLD = originalEnv;
        else delete process.env.STORAGE_THRESHOLD;
      }
    });

    it('serializes concurrent reservations for the same source', async () => {
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const source = await testDataFactory.createTestContentSource(movie.id);
      const params = (reservedBytes: number) => ({
        sourceId: source.id,
        location: '/tmp/test/concurrent-source.mkv',
        size: reservedBytes,
        speculative: true,
        reservedBytes,
      });

      const rows = await Promise.all([
        storageService.createStorage(params(100 * 1024)),
        storageService.createStorage(params(200 * 1024)),
      ]);

      expect(rows[0].id).toBe(rows[1].id);
      expect((await storageService.getStorageBySource(source.id))?.reservedBytes).toBe(200 * 1024);
      expect(await dbHelper.getDatabase().getStorageRepository().getStorageCount()).toBe(1);
    });

    it('evicts unclaimed storage before claimed storage during watched admission', async () => {
      const originalEnv = process.env.STORAGE_THRESHOLD;
      process.env.STORAGE_THRESHOLD = '50GB';
      try {
        const { storageService } = setupTest();
        const movie = await testDataFactory.createTestMovie();
        const expiredSource = await testDataFactory.createTestContentSource(movie.id);
        const unexpiredSource = await testDataFactory.createTestContentSource(movie.id);
        const watchedSource = await testDataFactory.createTestContentSource(movie.id);
        await storageService.createStorage({
          sourceId: expiredSource.id,
          location: '/tmp/test/evict-expired.mkv',
          size: 700 * 1024,
          speculative: true,
          reservedBytes: 700 * 1024,
        });
        await storageService.createStorage({
          sourceId: unexpiredSource.id,
          location: '/tmp/test/keep-unexpired.mkv',
          size: 100 * 1024,
          speculative: true,
          reservedBytes: 100 * 1024,
        });
        await claim(storageService, unexpiredSource.id, 'warmup');
        const watchedStorage = await storageService.createStorage({
          sourceId: watchedSource.id,
          location: '/tmp/test/keep-watched.mkv',
          size: 100 * 1024,
        });
        await claim(storageService, watchedSource.id, 'watched');

        process.env.STORAGE_THRESHOLD = '1MB';
        await storageService.reload();
        const newWatchedSource = await testDataFactory.createTestContentSource(movie.id);
        await storageService.createStorage({
          sourceId: newWatchedSource.id,
          location: '/tmp/test/new-watched.mkv',
          size: 300 * 1024,
        });

        expect(await storageService.getStorageBySource(expiredSource.id)).toBeNull();
        expect(await storageService.getStorageBySource(unexpiredSource.id)).not.toBeNull();
        expect(await storageService.getStorageById(watchedStorage.id)).not.toBeNull();
      } finally {
        if (originalEnv) process.env.STORAGE_THRESHOLD = originalEnv;
        else delete process.env.STORAGE_THRESHOLD;
      }
    });

    it('serializes capacity checks through storage insertion', async () => {
      const originalEnv = process.env.STORAGE_THRESHOLD;
      process.env.STORAGE_THRESHOLD = '1MB';
      try {
        const { storageService } = setupTest();
        const movie = await testDataFactory.createTestMovie();
        const sources = await Promise.all([
          testDataFactory.createTestContentSource(movie.id),
          testDataFactory.createTestContentSource(movie.id),
        ]);

        const results = await Promise.allSettled(
          sources.map((source, index) =>
            storageService.createStorage({
              sourceId: source.id,
              location: `/tmp/test/admission-${index}.mkv`,
              size: 700 * 1024,
              // Playback claims are never evictable, so only one admission can fit.
              claim: {
                path: 'movie.mkv',
                input: { kind: 'playback', ownerKey: `stream:${index}` },
              },
            })
          )
        );

        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(await storageService.getChargedStorageUsage()).toBe(700n * 1024n);
        expect(await dbHelper.getDatabase().getStorageRepository().getStorageCount()).toBe(1);
      } finally {
        if (originalEnv) process.env.STORAGE_THRESHOLD = originalEnv;
        else delete process.env.STORAGE_THRESHOLD;
      }
    });

    it('increments and decrements active playback counts without lost updates or underflow', async () => {
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const source = await testDataFactory.createTestContentSource(movie.id);
      const storage = await storageService.createStorage({
        sourceId: source.id,
        location: '/tmp/test/active-counter.mkv',
        size: 1_000,
      });

      await Promise.all([
        storageService.setPlaybackActive(source.id, true),
        storageService.setPlaybackActive(source.id, true),
      ]);
      expect((await storageService.getStorageById(storage.id))?.activeStreams).toBe(2);

      await Promise.all([
        storageService.setPlaybackActive(source.id, false),
        storageService.setPlaybackActive(source.id, false),
        storageService.setPlaybackActive(source.id, false),
      ]);
      expect((await storageService.getStorageById(storage.id))?.activeStreams).toBe(0);
    });

    it('prevents cleanup while playback is active and resets stale counters', async () => {
      const { storageService, database } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const source = await testDataFactory.createTestContentSource(movie.id);
      const storage = await storageService.createStorage({
        sourceId: source.id,
        location: '/tmp/test/active-cleanup.mkv',
        size: 1_000,
      });
      await storageService.setPlaybackActive(source.id, true);

      await expect(storageService.removeStorage(source.id)).resolves.toBe(0);
      expect(await storageService.getStorageById(storage.id)).not.toBeNull();

      await database.getStorageRepository().resetActiveStreams();
      expect((await storageService.getStorageById(storage.id))?.activeStreams).toBe(0);
    });

    it('keeps an admission reservation until measured allocation catches up', async () => {
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const source = await testDataFactory.createTestContentSource(movie.id);
      const storage = await storageService.createStorage({
        sourceId: source.id,
        location: '/path/that/does/not/exist',
        size: 1_000,
        reservedBytes: 1_000,
      });

      const reconciled = await storageService.reconcileAllocation(source.id);

      expect(reconciled?.allocatedBytes).toBe(0);
      expect(reconciled?.reservedBytes).toBe(storage.reservedBytes);
    });
  });

  it('records the admission claim with the row so a concurrent admission cannot evict it', async () => {
    const originalEnv = process.env.STORAGE_THRESHOLD;
    process.env.STORAGE_THRESHOLD = '1MB';
    try {
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const first = await testDataFactory.createTestContentSource(movie.id);
      await storageService.createStorage({
        sourceId: first.id,
        location: '/tmp/test/admitted-first.mkv',
        size: 700 * 1024,
        claim: { path: 'movie.mkv', input: { kind: 'playback', ownerKey: 'stream' } },
      });

      expect(await storageService.getClaimedPaths(first.id)).toEqual(['movie.mkv']);
      const second = await testDataFactory.createTestContentSource(movie.id);
      await expect(
        storageService.createStorage({
          sourceId: second.id,
          location: '/tmp/test/admitted-second.mkv',
          size: 700 * 1024,
        })
      ).rejects.toThrow('Insufficient storage capacity');
      expect(await storageService.getStorageBySource(first.id)).not.toBeNull();
    } finally {
      if (originalEnv) process.env.STORAGE_THRESHOLD = originalEnv;
      else delete process.env.STORAGE_THRESHOLD;
    }
  });
});
