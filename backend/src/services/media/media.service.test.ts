jest.mock('@database/database');

import { MockCache } from '@__test-utils__/cache.mock';
import { logger as mockLogger } from '@logger';

import { Database } from '@database/database';
import type { Movie } from '@entities/movie.entity';
import { TMDBApi } from '@services/content-catalog/tmdb/tmdb.api';
import { TmdbService } from '@services/content-catalog/tmdb/tmdb.service';
import { StatsService } from '@services/stats/stats.service';

import { MediaService } from './media.service';

const theWildRobotTMDBID = 1184918; // Movie: The Wild Robot
const cosmicPrincessTMDBID = 346698; // Movie: Cosmic Princess

const mockFetch = global.fetch as unknown as jest.Mock<typeof global.fetch>;

describe('MediaService', () => {
  let mockDb: Database;
  let mockMovieRepo: jest.Mocked<ReturnType<Database['getMovieRepository']>>;
  let mockGenreRepo: jest.Mocked<ReturnType<Database['getGenreRepository']>>;
  let mockSyncStateRepo: jest.Mocked<ReturnType<Database['getSyncStateRepository']>>;

  const setupTest = async () => {
    process.env.TMDB_API_ACCESS_TOKEN = 'test-token';

    // Create a new Database instance (which will be the mock)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb = new Database({} as any);
    mockMovieRepo = mockDb.getMovieRepository() as jest.Mocked<
      ReturnType<Database['getMovieRepository']>
    >;
    mockGenreRepo = mockDb.getGenreRepository() as jest.Mocked<
      ReturnType<Database['getGenreRepository']>
    >;
    mockSyncStateRepo = mockDb.getSyncStateRepository() as jest.Mocked<
      ReturnType<Database['getSyncStateRepository']>
    >;

    // Create TmdbService (with TMDBApi) and MediaService with mock DB
    const mockCache = new MockCache();
    const statsService = new StatsService();
    const tmdbApi = new TMDBApi(mockCache, statsService);
    const tmdbService = new TmdbService(mockDb, tmdbApi);
    const mediaService = new MediaService(mockDb, tmdbService);

    // Wait a bit for any async initialization (like getConfiguration) to complete
    await Promise.resolve();
    jest.clearAllMocks();
    return { mediaService, statsService, tmdbApi, tmdbService };
  };

  afterEach(() => {
    delete process.env.TMDB_API_ACCESS_TOKEN;
  });

  // Group existing movie tests
  describe('getMovie', () => {
    it('should fetch a movie from TMDB API if not in database', async () => {
      // Arrange
      const { mediaService } = await setupTest();
      mockMovieRepo.findByTMDBId.mockResolvedValueOnce(null);
      // Act
      const movie = await mediaService.getMovieByTmdbId(theWildRobotTMDBID);

      // Assert - Check that fetch was called with expected URL
      const movieDetailsCalls = mockFetch.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes(`/movie/${theWildRobotTMDBID}`)
      );

      expect(movieDetailsCalls.length).toBeGreaterThan(0);
      expect(movieDetailsCalls[0][0]).toContain(`/movie/${theWildRobotTMDBID}`);

      // Check database operations
      expect(mockMovieRepo.findByTMDBId).toHaveBeenCalledWith(theWildRobotTMDBID);
      expect(mockMovieRepo.create).toHaveBeenCalled();

      // Check movie properties
      expect(movie).not.toBeNull();
      expect(movie!.tmdbId).toBe(theWildRobotTMDBID);
    });

    it('should return a movie from the database if it exists', async () => {
      // Arrange
      const { mediaService } = await setupTest();

      const existingMovie = {
        id: 1,
        tmdbId: theWildRobotTMDBID,
        title: 'Test Movie',
        overview: 'Test Overview',
        // Add other necessary movie properties
      } as Movie;
      mockMovieRepo.findByTMDBId.mockResolvedValueOnce(existingMovie);

      // Act
      const movie = await mediaService.getMovieByTmdbId(theWildRobotTMDBID);

      // Assert
      expect(mockMovieRepo.findByTMDBId).toHaveBeenCalledWith(theWildRobotTMDBID);
      expect(mockFetch).toHaveBeenCalledTimes(0);
      expect(mockMovieRepo.create).not.toHaveBeenCalled();
      expect(movie).toEqual(existingMovie);
    });

    it('should fetch and update genres when adding a new movie', async () => {
      // Arrange
      const { mediaService } = await setupTest();
      mockMovieRepo.findByTMDBId.mockResolvedValueOnce(null); // Movie not in DB

      // Act
      await mediaService.getMovieByTmdbId(theWildRobotTMDBID);

      // Assert
      expect(mockMovieRepo.create).toHaveBeenCalled();
      // Based on TMDB 'en' movie genres (19) + TV genres (16) - duplicates = 27
      // The ensureGenres method will fetch all standard genres.
      expect(mockGenreRepo.createOrGetGenre).toHaveBeenCalledTimes(27);
      expect(mockMovieRepo.updateGenres).not.toHaveBeenCalled();
    });

    it('should fetch and add translations when adding a new movie', async () => {
      // Arrange
      const { mediaService } = await setupTest();
      mockMovieRepo.findByTMDBId.mockResolvedValueOnce(null); // Movie not in DB

      // Act
      await mediaService.getMovieByTmdbId(theWildRobotTMDBID);

      const expectedTranslation = expect.objectContaining({
        title: 'The Wild Robot',
        overview: 'Overview here.',
        tagline: '',
        language: 'en',
      });
      expect(mockMovieRepo.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          translations: expect.arrayContaining([expectedTranslation]),
        })
      );
      // The modified fixture has 2 translations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mockMovieRepo.create.mock.calls[0][1] as any).translations).toHaveLength(2);
    }); // End of getMovie describe block

    describe('syncMovies', () => {
      const getAllChangedMovieIdsSpy = jest.spyOn(TMDBApi.prototype, 'getAllChangedMovieIds');
      const MOVIE_SYNC_NAME = 'TMDB_Movies';

      afterEach(() => {
        getAllChangedMovieIdsSpy.mockClear();
        jest.useRealTimers();
      });

      it('should skip sync if last sync was less than 1 hour ago', async () => {
        // Arrange - syncMovies now lives on TmdbService
        const { tmdbService } = await setupTest();
        (mockSyncStateRepo.getLastSync as jest.Mock).mockResolvedValue(new Date());

        // Act
        await tmdbService.syncMovies();

        // Assert
        expect(mockSyncStateRepo.getLastSync).toHaveBeenCalledWith(MOVIE_SYNC_NAME);
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'TmdbService',
          'Last movie sync was less than 1 hour ago. Skipping.'
        );
        expect(getAllChangedMovieIdsSpy).not.toHaveBeenCalled();
        expect(mockSyncStateRepo.setLastSync).not.toHaveBeenCalled();
      });

      it('should proceed with sync if no last sync state exists', async () => {
        const { tmdbService } = await setupTest();
        const now = new Date('2025-05-11T10:00:00Z');
        jest.useFakeTimers({ now });
        (mockSyncStateRepo.getLastSync as jest.Mock).mockResolvedValue(null); // No last sync

        mockMovieRepo.findByTMDBId.mockImplementation(tmdbId => {
          if (`${theWildRobotTMDBID}` === `${tmdbId}`) {
            return Promise.resolve({
              id: 1,
              tmdbId,
              title: 'The Wild Robot',
              overview: 'Overview here.',
              tagline: '',
              releaseDate: new Date(),
              poster: '',
              backdrop: '',
              logo: '',
              runtime: 100,
              popularity: 10,
              rating: 8.5,
              genres: [],
              translations: [],
            } as unknown as Movie);
          }
          if (`${cosmicPrincessTMDBID}` === `${tmdbId}`) {
            return Promise.resolve({
              id: 2,
              tmdbId,
              title: 'Cosmic Princess',
              overview: 'Overview here.',
              tagline: '',
              releaseDate: new Date(),
              poster: '',
              backdrop: '',
              logo: '',
              runtime: 100,
              popularity: 10,
              rating: 8.5,
              genres: [],
              translations: [],
            } as unknown as Movie);
          }
          return Promise.resolve(null);
        });

        // Act
        await tmdbService.syncMovies();

        // Assert - TmdbService uses 'TmdbService' as logger prefix
        expect(mockSyncStateRepo.getLastSync).toHaveBeenCalledWith(MOVIE_SYNC_NAME);
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'TmdbService',
          expect.stringContaining('chunk 1/2')
        );
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'TmdbService',
          expect.stringContaining('chunk 2/2')
        );

        expect(getAllChangedMovieIdsSpy).toHaveBeenCalledTimes(2); // 2 pages
        const callArgs = getAllChangedMovieIdsSpy.mock.calls[0];
        const startDateArg = callArgs[0] as Date;
        const endDateArg = callArgs[1] as Date | undefined;

        // Check that startDate is roughly 24 hours before endDate, as per logic when no last sync
        expect(endDateArg).toBeDefined();
        if (endDateArg) {
          // Type guard for endDateArg
          const diffHours = (endDateArg.getTime() - startDateArg.getTime()) / (1000 * 60 * 60);
          expect(diffHours).toBeCloseTo(24, 0); // Check if it's approximately 24 hours
        }

        expect(mockMovieRepo.findByTMDBId).toHaveBeenCalledWith(theWildRobotTMDBID);
        expect(mockMovieRepo.findByTMDBId).toHaveBeenCalledWith(cosmicPrincessTMDBID);

        expect(mockMovieRepo.checkForChangesAndUpdate).toHaveBeenCalledTimes(2);
        expect(mockMovieRepo.checkForChangesAndUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ tmdbId: theWildRobotTMDBID }),
          expect.objectContaining({ tmdbId: theWildRobotTMDBID })
        );
        expect(mockMovieRepo.checkForChangesAndUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ tmdbId: cosmicPrincessTMDBID }),
          expect.objectContaining({ tmdbId: cosmicPrincessTMDBID })
        );

        expect(mockSyncStateRepo.setLastSync).toHaveBeenCalledTimes(2);
        expect(mockSyncStateRepo.setLastSync).toHaveBeenCalledWith(
          MOVIE_SYNC_NAME,
          new Date('2025-05-11T00:00:00Z')
        );
        expect(mockSyncStateRepo.setLastSync).toHaveBeenCalledTimes(2);
        expect(mockSyncStateRepo.setLastSync).toHaveBeenCalledWith(MOVIE_SYNC_NAME, now);
      });
    });
  });
});
