import { MockCache } from '@__test-utils__/cache.mock';
import { createMockMovie } from '@__test-utils__/mocks/movie.mock';
import { createMockTVShow } from '@__test-utils__/mocks/movie.mock';

import { Database } from '@database/database';
import type { MovieDetail, TVShowDetail } from '@services/catalog/catalog.types';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';

import { MediaService } from './media.service';

const THE_WILD_ROBOT_MEDIA_ID = 1184918; // Movie: The Wild Robot

const movieDetail = (mediaId: number): MovieDetail => ({
  mediaType: 'movie',
  mediaId,
  imdbId: 'tt11286310',
  title: 'The Wild Robot',
  overview: 'Overview here.',
  tagline: '',
  releaseDate: '2024-09-12',
  runtime: 102,
  poster: 'https://img/poster.jpg',
  backdrop: 'https://img/backdrop.jpg',
  logo: '',
  genres: [{ id: 16, name: 'Animation' }],
  popularity: 100,
  rating: 8.5,
  detailsSyncedAt: new Date().toISOString(),
});

const tvShowDetail = (mediaId: number): TVShowDetail => ({
  mediaType: 'tv',
  mediaId,
  imdbId: 'tt0999929',
  name: 'Test Show',
  overview: 'Overview here.',
  tagline: '',
  firstAirDate: '2010-01-01',
  status: 'Ended',
  type: 'Scripted',
  inProduction: false,
  episodeRunTime: [45],
  poster: 'https://img/poster.jpg',
  backdrop: 'https://img/backdrop.jpg',
  logo: '',
  genres: [{ id: 18, name: 'Drama' }],
  popularity: 100,
  rating: 8.5,
  seasons: [],
  detailsSyncedAt: new Date().toISOString(),
});

describe('MediaService', () => {
  let mockDb: Database;
  let mockMovieRepo: jest.Mocked<ReturnType<Database['getMovieRepository']>>;
  let mockTVShowRepo: jest.Mocked<ReturnType<Database['getTVShowRepository']>>;
  let mockCatalogClient: jest.Mocked<CatalogClientService>;

  const setupTest = () => {
    mockDb = new Database({} as never);
    mockMovieRepo = mockDb.getMovieRepository() as jest.Mocked<
      ReturnType<Database['getMovieRepository']>
    >;
    mockTVShowRepo = mockDb.getTVShowRepository() as jest.Mocked<
      ReturnType<Database['getTVShowRepository']>
    >;
    mockCatalogClient = {
      getMovie: jest.fn(),
      getTVShow: jest.fn(),
      getSeason: jest.fn(),
      setWatching: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CatalogClientService>;

    const mediaService = new MediaService(mockDb, mockCatalogClient);
    return { mediaService };
  };

  afterEach(() => {
    jest.clearAllMocks();
    void MockCache;
  });

  describe('getMovieByMediaId', () => {
    it('mirrors catalog details into the local index and returns the local row', async () => {
      const { mediaService } = setupTest();
      const detail = movieDetail(THE_WILD_ROBOT_MEDIA_ID);
      const local = createMockMovie({ mediaId: THE_WILD_ROBOT_MEDIA_ID, title: detail.title });
      mockCatalogClient.getMovie.mockResolvedValueOnce(detail);
      mockMovieRepo.upsertMovieDetail.mockResolvedValueOnce(local);

      const result = await mediaService.getMovieByMediaId(THE_WILD_ROBOT_MEDIA_ID, 'en');

      expect(mockCatalogClient.getMovie).toHaveBeenCalledWith(THE_WILD_ROBOT_MEDIA_ID, 'en');
      expect(mockMovieRepo.upsertMovieDetail).toHaveBeenCalledWith(detail);
      expect(result?.local).toBe(local);
      expect(result?.detail).toBe(detail);
    });

    it('returns null when the catalog does not know the media', async () => {
      const { mediaService } = setupTest();
      mockCatalogClient.getMovie.mockResolvedValueOnce(null);

      const result = await mediaService.getMovieByMediaId(999999999, 'en');

      expect(result).toBeNull();
      expect(mockMovieRepo.upsertMovieDetail).not.toHaveBeenCalled();
    });
  });

  describe('getTVShowByMediaId', () => {
    it('mirrors catalog show details into the local index', async () => {
      const { mediaService } = setupTest();
      const detail = tvShowDetail(1234);
      const local = createMockTVShow({ mediaId: 1234, name: detail.name });
      mockCatalogClient.getTVShow.mockResolvedValueOnce(detail);
      mockTVShowRepo.upsertTVShowDetail.mockResolvedValueOnce(local);

      const result = await mediaService.getTVShowByMediaId(1234, 'en');

      expect(mockCatalogClient.getTVShow).toHaveBeenCalledWith(1234, 'en');
      expect(mockTVShowRepo.upsertTVShowDetail).toHaveBeenCalledWith(detail);
      expect(result?.local).toBe(local);
    });
  });

  describe('markShowAsWatching', () => {
    it('marks the show locally and pushes the watching set to the catalog', async () => {
      const { mediaService } = setupTest();
      mockTVShowRepo.markAsWatching.mockResolvedValueOnce(undefined);
      mockTVShowRepo.getWatchingTVShowMediaIds.mockResolvedValueOnce([1234, 5678]);

      await mediaService.markShowAsWatching(1234);

      expect(mockTVShowRepo.markAsWatching).toHaveBeenCalledWith(1234);
      expect(mockCatalogClient.setWatching).toHaveBeenCalledWith([1234, 5678]);
    });

    it('does not fail when the catalog push fails', async () => {
      const { mediaService } = setupTest();
      mockTVShowRepo.markAsWatching.mockResolvedValueOnce(undefined);
      mockTVShowRepo.getWatchingTVShowMediaIds.mockResolvedValueOnce([1234]);
      mockCatalogClient.setWatching.mockRejectedValueOnce(new Error('catalog down'));

      await expect(mediaService.markShowAsWatching(1234)).resolves.toBeUndefined();
      expect(mockTVShowRepo.markAsWatching).toHaveBeenCalledWith(1234);
    });
  });
});
