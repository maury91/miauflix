import { extractSourceMetadata } from '@miauflix/source-metadata-extractor';
import {
  calculateApproximateBitrate,
  qualityToResolution,
} from '@miauflix/source-metadata-extractor';
import type { Cache } from 'cache-manager';

import type { SourceMetadata } from '@content-directories/content-directory.abstract';
import { AbstractContentDirectory } from '@content-directories/content-directory.abstract';
import type { DownloadService } from '@services/download/download.service';

import { TheRARBGApi } from './therarbg.api';
import type { ImdbDetailPost, ImdbMetadata } from './therarbg.types';

export class TherarbgContentDirectory extends AbstractContentDirectory<TheRARBGApi> {
  protected readonly api: TheRARBGApi;

  name = 'TheRARBG';

  constructor(
    cache: Cache,
    private readonly downloadService: DownloadService
  ) {
    super();
    this.api = new TheRARBGApi(cache);
  }

  /**
   * Normalize a ImdbPost (from detailed API) into SourceMetadata format.
   */
  private normalizaImdbPost(
    sourceMetadata: ImdbDetailPost,
    movieDetails: ImdbMetadata
  ): SourceMetadata {
    const metadata = extractSourceMetadata({
      name: sourceMetadata.name,
      type: sourceMetadata.type,
      size: sourceMetadata.size,
      files: sourceMetadata.files,
      category: sourceMetadata.category_str,
      trackerMetadata: {
        imdbId: sourceMetadata.imdb,
        uploadDate: new Date(sourceMetadata.timestamp),
        language: sourceMetadata.language,
        season: sourceMetadata.season,
        episode: sourceMetadata.episode,
        runtime: parseInt(movieDetails.runtime, 10),
      },
    });
    return {
      audioCodec: metadata.audioCodec,
      bitrate: calculateApproximateBitrate(
        sourceMetadata.size,
        parseInt(movieDetails.runtime, 10) / 60
      ),
      broadcasters: sourceMetadata.seeders ?? 0,
      hash: sourceMetadata.info_hash,
      language: metadata.language,
      magnetLink: this.downloadService.generateLink(
        sourceMetadata.info_hash,
        sourceMetadata.trackers
          .filter(tracker => tracker.scrape_error === null)
          .map(tracker => tracker.tracker)
      ),
      quality: metadata.quality ?? null,
      resolution: qualityToResolution(metadata.quality),
      score: 0, // ToDo: use scoringService to calculate score
      size: sourceMetadata.size,
      source: metadata.source ?? null,
      type: sourceMetadata.type,
      uploadDate: new Date(sourceMetadata.timestamp),
      url: '', // TheRARBG does not provide a direct download URL
      videoCodec: metadata.videoCodec[0] ?? null,
      watchers: sourceMetadata.leechers ?? 0,
    };
  }

  /**
   * Fetch movie data from TheRARBG and return normalized sources and trailer info.
   */
  async getMovie(imdbId: string, highPriority?: boolean) {
    const movie = await this.api.searchByImdbId(imdbId, highPriority);

    if (!movie || !movie.trb_posts || !movie.trb_posts.length) {
      return { sources: [], trailerCode: '' };
    }

    return {
      sources: movie.trb_posts.map(sourceMetadata =>
        this.normalizaImdbPost(sourceMetadata, movie.imdb)
      ),
      trailerCode: '',
    };
  }

  /**
   * Get TV show episodes from theRarBG.
   * Uses the search functionality with TV-specific filtering.
   */
  async getTVShow(
    imdbId: string,
    highPriority?: boolean
  ): Promise<{
    sources: SourceMetadata[];
    trailerCode: string;
  }> {
    // Try the detailed API first
    const tvShow = await this.api.searchByImdbId(imdbId, highPriority);

    if (tvShow && tvShow.trb_posts && tvShow.trb_posts.length) {
      return {
        sources: tvShow.trb_posts.map(sourceMetadata =>
          this.normalizaImdbPost(sourceMetadata, tvShow.imdb)
        ),
        trailerCode: '',
      };
    }

    // No sources found
    return {
      sources: [],
      trailerCode: '',
    };
  }
}
