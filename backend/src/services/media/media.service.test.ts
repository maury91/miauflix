import { MockCache } from '@__test-utils__/cache.mock';
import { logger as mockLogger } from '@logger';

import type { Database } from '@database/database';
import type { Movie } from '@entities/movie.entity';
import { StatsService } from '@services/stats/stats.service';
import { TMDBApi } from '@services/tmdb/tmdb.api';

import { MediaService } from './media.service';

const mockCache = new MockCache();

const mockMovieRepo = {
  findByTMDBId: jest.fn((_tmdbId: number | string): Promise<Movie | null> => Promise.resolve(null)),
  create: jest.fn(details =>
    Promise.resolve({
      id: 1,
      tmdbId: details.tmdbId,
      title: details.title,
      overview: details.overview,
      tagline: details.tagline,
      releaseDate: details.releaseDate,
      poster: details.poster,
      backdrop: details.backdrop,
      logo: details.logo,
      runtime: details.runtime,
      popularity: details.popularity,
      rating: details.rating,
      genres: details.genres || [],
      translations: [],
    } as unknown as Movie)
  ),
  addTranslation: jest.fn(() => Promise.resolve({})),
  checkForChangesAndUpdate: jest.fn(() => Promise.resolve({})),
  updateGenres: jest.fn(() => Promise.resolve({})),
};

const mockGenreRepo = {
  findAll: jest.fn(() =>
    Promise.resolve([{ id: 1, name: 'Action', translations: [{ language: 'en' }] }])
  ),
  createOrGetGenre: jest.fn(id =>
    Promise.resolve({ id, name: 'Mocked Genre', translations: [{ language: 'en' }] })
  ),
  createTranslation: jest.fn(() => Promise.resolve({})),
};

const mockSyncStateRepo = {
  getLastSync: jest.fn((): Promise<Date | null> => Promise.resolve(null)),
  setLastSync: jest.fn((): Promise<void> => Promise.resolve()),
};

const theWildRobotTMDBID = 1184918; // Movie: The Wild Robot
const cosmicPrincessTMDBID = 346698; // Movie: Cosmic Princess

const mockDb = {
  getMovieRepository: () => mockMovieRepo,
  getTVShowRepository: () => ({}),
  getGenreRepository: () => mockGenreRepo,
  getProgressRepository: () => ({}),
  getSyncStateRepository: () => mockSyncStateRepo,
  getSeasonRepository: () => ({}),
} as unknown as Database;

const mockFetch = global.fetch as unknown as jest.Mock<typeof global.fetch>;

describe('MediaService', () => {
  const setupTest = async () => {
    process.env.TMDB_API_ACCESS_TOKEN = 'test-token';

    // Create the MediaService with the mock DB and a new TMDBApi instance
    const statsService = new StatsService();
    const tmdbApi = new TMDBApi(mockCache, statsService);
    const mediaService = new MediaService(mockDb, tmdbApi);

    // Wait a bit for any async initialization (like getConfiguration) to complete
    await Promise.resolve();
    jest.clearAllMocks();
    mockFetch.mockClear();
    return { mediaService, statsService, tmdbApi };
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
      // Based on TMDB 'en' movie genres (19) + TV genres (16) = 35
      // The ensureGenres method will fetch all standard genres.
      expect(mockGenreRepo.createOrGetGenre).toHaveBeenCalledTimes(35);
      expect(mockMovieRepo.updateGenres).not.toHaveBeenCalled();
    });

    it('should fetch and add translations when adding a new movie', async () => {
      // Arrange
      const { mediaService } = await setupTest();
      mockMovieRepo.findByTMDBId.mockResolvedValueOnce(null); // Movie not in DB

      // Act
      await mediaService.getMovieByTmdbId(theWildRobotTMDBID);

      // Assert
      expect(mockMovieRepo.create).toHaveBeenCalled();
      // The modified fixture has 2 translations
      expect(mockMovieRepo.addTranslation).toHaveBeenCalledTimes(2);

      // Check that addTranslation was called with the expected data from the fixture
      const expectedMovieArg = expect.objectContaining({ id: 1, tmdbId: theWildRobotTMDBID });
      const expectedEnTranslationPayload = {
        title: 'The Wild Robot',
        overview: 'Overview here.',
        tagline: '', // As per the modified fixture
        language: 'en',
      };

      // Verify details for the first call (corresponds to the first translation in the fixture)
      expect(mockMovieRepo.addTranslation).toHaveBeenNthCalledWith(
        1,
        expectedMovieArg,
        expect.objectContaining(expectedEnTranslationPayload)
      );

      // Verify details for the second call (corresponds to the second translation in the fixture)
      // In this specific fixture, the payload is identical to the first.
      expect(mockMovieRepo.addTranslation).toHaveBeenNthCalledWith(
        2,
        expectedMovieArg,
        expect.objectContaining(expectedEnTranslationPayload)
      );
    }); // End of getMovie describe block

    describe('syncMovies', () => {
      const getAllChangedMovieIdsSpy = jest.spyOn(TMDBApi.prototype, 'getAllChangedMovieIds');
      const MOVIE_SYNC_NAME = 'TMDB_Movies';

      afterEach(() => {
        getAllChangedMovieIdsSpy.mockClear();
      });

      it('should skip sync if last sync was less than 1 hour ago', async () => {
        // Arrange
        const { mediaService } = await setupTest();
        // Mock getLastSync to return a very recent time (effectively < 1 hour ago)
        (mockSyncStateRepo.getLastSync as jest.Mock).mockResolvedValue(new Date());

        // Act
        await mediaService.syncMovies();

        // Assert
        expect(mockSyncStateRepo.getLastSync).toHaveBeenCalledWith(MOVIE_SYNC_NAME);
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'MovieSync',
          'Last sync was less than 1 hour ago. Skipping sync.'
        );
        expect(getAllChangedMovieIdsSpy).not.toHaveBeenCalled();
        expect(mockSyncStateRepo.setLastSync).not.toHaveBeenCalled();
      });

      it('should proceed with sync if no last sync state exists', async () => {
        const { mediaService } = await setupTest();
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
        await mediaService.syncMovies();

        // Assert
        // Movie changes mock has 199 changes ( 2 pages ) on day 1
        // 100 changes ( 1 page ) on day 2
        expect(mockSyncStateRepo.getLastSync).toHaveBeenCalledWith(MOVIE_SYNC_NAME);
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'MovieSync',
          expect.stringContaining('Chunk 1/2 - Processing page 1/2')
        );
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'MovieSync',
          expect.stringContaining('Chunk 1/2 - Processing page 2/2')
        );
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'MovieSync',
          expect.stringContaining('Chunk 2/2 - Processing page 1/1')
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

        jest.useRealTimers();
      });
    });
  });
});
