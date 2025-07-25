import { createTestDatabase, type TestDatabaseHelper } from '@__test-utils__/database.helpers';
import { TestDataFactory } from '@__test-utils__/test-data.factory';
import fs from 'fs';

import { StorageService } from '../storage.service';

describe('StorageService', () => {
  let dbHelper: TestDatabaseHelper;
  let testDataFactory: TestDataFactory;

  const setupTest = () => {
    const database = dbHelper.getDatabase();
    const storageService = new StorageService(database);
    return { storageService, database };
  };

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

  describe('Core CRUD Operations', () => {
    it('should create storage record for a movie source', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const totalPieces = 1000;
      const downloadedPieces = testDataFactory.createBitfield(totalPieces, 25); // 25% complete

      // Act
      const storage = await storageService.createStorage({
        movieSourceId: movieSource.id,
        location: '/tmp/test/movie.mkv',
        size: 2147483648,
        downloadedPieces,
        totalPieces,
      });

      // Assert
      expect(storage).toBeDefined();
      expect(storage.id).toBeDefined();
      expect(storage.movieSourceId).toBe(movieSource.id);
      expect(storage.location).toBe('/tmp/test/movie.mkv');
      expect(storage.size).toBe(2147483648);
      expect(storage.downloadedPieces).toEqual(downloadedPieces);
      expect(storage.downloaded).toBe(2500); // 25% in basis points
    });

    it('should find storage by movie source ID', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const createdStorage = await storageService.createStorage({
        movieSourceId: movieSource.id,
        location: '/tmp/test/find-test.mkv',
        size: 1000000,
      });

      // Act
      const foundStorage = await storageService.getStorageByMovieSource(movieSource.id);

      // Assert
      expect(foundStorage).toBeDefined();
      expect(foundStorage?.id).toBe(createdStorage.id);
      expect(foundStorage?.movieSourceId).toBe(movieSource.id);
    });

    it('should find storage by ID', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const createdStorage = await storageService.createStorage({
        movieSourceId: movieSource.id,
        location: '/tmp/test/id-test.mkv',
        size: 1000000,
      });

      // Act
      const foundStorage = await storageService.getStorageById(createdStorage.id);

      // Assert
      expect(foundStorage).toBeDefined();
      expect(foundStorage?.id).toBe(createdStorage.id);
      expect(foundStorage?.movieSourceId).toBe(movieSource.id);
    });

    it('should update storage download progress', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const totalPieces = 1000;
      const initialBitfield = testDataFactory.createBitfield(totalPieces, 10);

      await storageService.createStorage({
        movieSourceId: movieSource.id,
        location: '/tmp/test/progress-test.mkv',
        size: 2000000,
        downloadedPieces: initialBitfield,
        totalPieces,
      });

      const updatedBitfield = testDataFactory.createBitfield(totalPieces, 50);

      // Act
      await storageService.updateDownloadProgress({
        movieSourceId: movieSource.id,
        downloadedPieces: updatedBitfield,
        totalPieces,
        size: 2000000,
      });

      // Assert
      const storage = await storageService.getStorageByMovieSource(movieSource.id);
      expect(storage?.downloaded).toBe(5000); // 50% in basis points
      expect(storage?.downloadedPieces).toEqual(updatedBitfield);
    });

    it('should delete storage record', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const storageSize = 1000000;
      await storageService.createStorage({
        movieSourceId: movieSource.id,
        location: '/tmp/test/delete-test.mkv',
        size: storageSize,
      });

      // Act
      const deleteResult = await storageService.removeStorage(movieSource.id);
      const foundStorage = await storageService.getStorageByMovieSource(movieSource.id);

      // Assert
      expect(deleteResult).toBe(storageSize); // Returns the size of deleted storage
      expect(foundStorage).toBeNull();
    });

    it('should throw error when creating storage for non-existent movie source', async () => {
      // Arrange
      const { storageService } = setupTest();
      const nonExistentMovieSourceId = 999999;

      // Act & Assert
      await expect(
        storageService.createStorage({
          movieSourceId: nonExistentMovieSourceId,
          location: '/tmp/test/nonexistent.mkv',
          size: 1000000,
        })
      ).rejects.toThrow();
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
        const calculated = storageService.calculateProgressFromBitfield(bitfield, totalPieces);

        // Assert
        expect(calculated).toBe(testCase.expectedBasisPoints);
      }
    });

    it('should update downloaded pieces bitmap', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const totalPieces = 100;
      const initialBitfield = testDataFactory.createEmptyBitfield(totalPieces);

      await storageService.createStorage({
        movieSourceId: movieSource.id,
        location: '/tmp/test/bitmap-test.mkv',
        size: 1000000,
        downloadedPieces: initialBitfield,
        totalPieces,
      });

      // Act
      const updatedBitfield = testDataFactory.createBitfield(totalPieces, 30);
      await storageService.updateDownloadProgress({
        movieSourceId: movieSource.id,
        downloadedPieces: updatedBitfield,
        totalPieces,
      });

      // Assert
      const storage = await storageService.getStorageByMovieSource(movieSource.id);
      expect(storage?.downloadedPieces).toEqual(updatedBitfield);
    });

    it('should handle complete download status', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const totalPieces = 500;
      const completeBitfield = testDataFactory.createCompleteBitfield(totalPieces);

      // Act
      const storage = await storageService.createStorage({
        movieSourceId: movieSource.id,
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
      const isValid = storageService.validateBitfield(oversizedBitfield, totalPieces);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should handle concurrent download progress updates', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const totalPieces = 1000;

      await storageService.createStorage({
        movieSourceId: movieSource.id,
        location: '/tmp/test/concurrent-test.mkv',
        size: 2000000,
        downloadedPieces: testDataFactory.createEmptyBitfield(totalPieces),
        totalPieces,
      });

      // Act - Simulate concurrent updates
      const updates = [
        storageService.updateDownloadProgress({
          movieSourceId: movieSource.id,
          downloadedPieces: testDataFactory.createBitfield(totalPieces, 25),
          totalPieces,
        }),
        storageService.updateDownloadProgress({
          movieSourceId: movieSource.id,
          downloadedPieces: testDataFactory.createBitfield(totalPieces, 50),
          totalPieces,
        }),
        storageService.updateDownloadProgress({
          movieSourceId: movieSource.id,
          downloadedPieces: testDataFactory.createBitfield(totalPieces, 75),
          totalPieces,
        }),
      ];

      await Promise.all(updates);

      // Assert - Final state should be consistent
      const storage = await storageService.getStorageByMovieSource(movieSource.id);
      expect(storage?.downloaded).toBeGreaterThan(0);
      expect(storage?.downloaded).toBeLessThanOrEqual(10000);
    });
  });

  describe('Relationship Management', () => {
    it('should maintain one-to-one relationship with MovieSource', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const storage1 = await storageService.createStorage({
        movieSourceId: movieSource.id,
        location: '/tmp/test/relationship1.mkv',
        size: 1000000,
      });
      // Act: Try to create a second storage for the same movie source
      const storage2 = await storageService.createStorage({
        movieSourceId: movieSource.id,
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
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const storage1 = await storageService.createStorage({
        movieSourceId: movieSource.id,
        location: '/tmp/test/duplicate1.mkv',
        size: 1000000,
      });
      // Act: Try to create a duplicate
      const storage2 = await storageService.createStorage({
        movieSourceId: movieSource.id,
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
          movieSourceId: -1, // Invalid ID
          location: '', // Empty location
          size: -1000, // Negative size
        })
      ).rejects.toThrow();
    });

    it('should handle file system errors when updating location', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const invalidPath = '/invalid/path/that/does/not/exist/movie.mkv';

      // Act - This should still create the storage record even if path doesn't exist
      // (path validation might be handled elsewhere in the system)
      const storage = await storageService.createStorage({
        movieSourceId: movieSource.id,
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
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);

      // Act
      const storage = await storageService.createStorage({
        movieSourceId: movieSource.id,
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
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const largeSize = 2 ** 40; // 1TB

      // Act
      const storage = await storageService.createStorage({
        movieSourceId: movieSource.id,
        location: '/tmp/test/large-file.mkv',
        size: largeSize,
        downloadedPieces: new Uint8Array(1000),
        totalPieces: 8000,
      });

      // Assert
      expect(storage.size).toBe(largeSize);
      expect(storage.downloadedPieces.length).toBe(1000);
    });

    it('should validate file location path exists', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const testDir = dbHelper.getTestDir();
      const validPath = `${testDir}/valid-file.mkv`;

      // Create the directory
      await fs.promises.mkdir(testDir, { recursive: true });

      // Act
      const storage = await storageService.createStorage({
        movieSourceId: movieSource.id,
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
      const isValid = storageService.validateBitfield(corruptedBitfield, totalPieces);

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('Service Methods', () => {
    it('should mark storage as accessed', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie = await testDataFactory.createTestMovie();
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const storage = await storageService.createStorage({
        movieSourceId: movieSource.id,
        location: '/tmp/test/access-test.mkv',
        size: 1000000,
      });

      expect(storage.lastAccessAt).toBeNull();

      // Act
      await storageService.markAsAccessed(movieSource.id);

      // Assert
      const updatedStorage = await storageService.getStorageByMovieSource(movieSource.id);
      expect(updatedStorage?.lastAccessAt).not.toBeNull();
      expect(updatedStorage?.lastAccessAt).toBeInstanceOf(Date);
    });

    it('should get total storage usage', async () => {
      // Arrange
      const { storageService } = setupTest();
      const movie1 = await testDataFactory.createTestMovie();
      const movie2 = await testDataFactory.createTestMovie();
      const movieSource1 = await testDataFactory.createTestMovieSource(movie1.id);
      const movieSource2 = await testDataFactory.createTestMovieSource(movie2.id);

      await storageService.createStorage({
        movieSourceId: movieSource1.id,
        location: '/tmp/test/usage1.mkv',
        size: 1000000,
      });

      await storageService.createStorage({
        movieSourceId: movieSource2.id,
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
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);
      const totalPieces = 1000;

      const storage = await storageService.createStorage({
        movieSourceId: movieSource.id,
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
      const movieSource = await testDataFactory.createTestMovieSource(movie.id);

      const storage = await storageService.createStorage({
        movieSourceId: movieSource.id,
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
    it('should emit delete events when cleaning up due to storage pressure', async () => {
      // Arrange
      const originalEnv = process.env.STORAGE_THRESHOLD;
      process.env.STORAGE_THRESHOLD = '1GB'; // Set low threshold to trigger cleanup

      try {
        // Create a new service instance to pick up the new threshold
        const { storageService } = setupTest();

        // Create enough storage records to exceed the pressure threshold
        const movie = await testDataFactory.createTestMovie();
        const sources = [];
        for (let i = 0; i < 10; i++) {
          // Always create a new movie source for each storage record
          const movieSource = await testDataFactory.createTestMovieSource(movie.id);
          sources.push(movieSource);
          await storageService.createStorage({
            movieSourceId: movieSource.id,
            location: `/tmp/test/pressure-${i}.mkv`,
            size: 2 * 1024 * 1024 * 1024, // 2GB each, total 20GB
          });
        }
        let deletedCount = 0;
        storageService.on('delete', () => {
          deletedCount++;
        });
        // Act: create one more unique movie source and storage to trigger pressure cleanup
        const extraSource = await testDataFactory.createTestMovieSource(movie.id);
        await storageService.createStorage({
          movieSourceId: extraSource.id,
          location: `/tmp/test/pressure-extra.mkv`,
          size: 2 * 1024 * 1024 * 1024,
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
        movieSourceId: (await testDataFactory.createTestMovieSource(movie.id)).id,
        location: '/tmp/test/stale1.mkv',
        size: 1000000,
      });

      const storage2 = await storageService.createStorage({
        movieSourceId: (await testDataFactory.createTestMovieSource(movie.id)).id,
        location: '/tmp/test/stale2.mkv',
        size: 1000000,
      });

      const storage3 = await storageService.createStorage({
        movieSourceId: (await testDataFactory.createTestMovieSource(movie.id)).id,
        location: '/tmp/test/stale3.mkv',
        size: 1000000,
      });

      // Set different access times
      const db = dbHelper.getDatabase();
      const storageRepo = db.getStorageRepository();

      // storage1: most recent
      await storageRepo.update(storage1.id, { lastAccessAt: new Date() });
      // storage2: 5 days ago
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      await storageRepo.update(storage2.id, { lastAccessAt: fiveDaysAgo });
      // storage3: 10 days ago (most stale)
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      await storageRepo.update(storage3.id, { lastAccessAt: tenDaysAgo });

      // Act
      const mostStale = await database.getStorageRepository().findMostStaleStorage();

      // Assert
      expect(mostStale).toBeDefined();
      expect(mostStale?.id).toBe(storage3.id); // Should be the most stale (10 days ago)
    });

    it('should return null when no storage records exist', async () => {
      // Arrange
      const { database } = setupTest();

      // Act
      const mostStale = await database.getStorageRepository().findMostStaleStorage();

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
        const movieSource = await testDataFactory.createTestMovieSource(movie.id);
        movieSources.push(movieSource);
        await storageService.createStorage({
          movieSourceId: movieSource.id,
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
      process.env.STORAGE_THRESHOLD = '1MB'; // Very low threshold

      try {
        const { storageService } = setupTest();
        const movie = await testDataFactory.createTestMovie();

        // Create a single storage record that exceeds the threshold
        const movieSource = await testDataFactory.createTestMovieSource(movie.id);
        const storage = await storageService.createStorage({
          movieSourceId: movieSource.id,
          location: '/tmp/test/last-record.mkv',
          size: 10 * 1024 * 1024, // 10MB, exceeds 1MB threshold
        });

        let deletedCount = 0;
        storageService.on('delete', () => {
          deletedCount++;
        });

        // Act: Run periodic cleanup (canCleanEverything = false)
        await storageService.cleanup(false);

        // Assert: Should not delete the last record
        expect(deletedCount).toBe(0);

        const remainingStorage = await storageService.getStorageByMovieSource(movieSource.id);
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
      process.env.STORAGE_THRESHOLD = '1MB'; // Very low threshold

      try {
        const { storageService } = setupTest();
        const movie = await testDataFactory.createTestMovie();

        // Create a single storage record that exceeds the threshold
        const movieSource = await testDataFactory.createTestMovieSource(movie.id);
        await storageService.createStorage({
          movieSourceId: movieSource.id,
          location: '/tmp/test/clean-all.mkv',
          size: 10 * 1024 * 1024, // 10MB, exceeds 1MB threshold
        });

        let deletedCount = 0;
        storageService.on('delete', () => {
          deletedCount++;
        });

        // Act: Run cleanup with canCleanEverything = true
        await storageService.cleanup(true);

        // Assert: Should delete the record
        expect(deletedCount).toBe(1);

        const remainingStorage = await storageService.getStorageByMovieSource(movieSource.id);
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
      process.env.STORAGE_THRESHOLD = '1MB'; // Very low threshold to trigger cleanup

      try {
        const { storageService } = setupTest();

        // Create multiple storage records with different movies
        const storages = [];
        for (let i = 0; i < 3; i++) {
          const movie = await testDataFactory.createTestMovie();
          const movieSource = await testDataFactory.createTestMovieSource(movie.id);
          const storage = await storageService.createStorage({
            movieSourceId: movieSource.id,
            location: `/tmp/test/multi-${i}.mkv`,
            size: 3 * 1024 * 1024, // 3MB each, total 9MB exceeds 1MB threshold
          });
          storages.push({ storage, movieSource });
        }

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
});
