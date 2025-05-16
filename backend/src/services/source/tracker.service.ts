import { YTSApi } from '@trackers/yts/yts.api';

/**
 * Service for searching torrents from various tracker sources
 */
export class TrackerService {
  private readonly ytsApi: YTSApi;

  constructor() {
    this.ytsApi = new YTSApi();
  }

  /**
   * Search torrents for a movie by its IMDb ID
   *
   * @param imdbId - The IMDb ID of the movie (format: ttXXXXXXX)
   * @returns A movie object with normalized torrents or null if not found
   */
  public async searchTorrentsForMovie(imdbId: string) {
    try {
      // Currently only using YTS, but this can be extended to use multiple trackers
      const movie = await this.ytsApi.getMovieWithTorrents(imdbId);
      return movie;
    } catch (error) {
      console.error(`Error searching torrents for movie ${imdbId}:`, error);
      return null;
    }
  }
}
