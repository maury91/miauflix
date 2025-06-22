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

  constructor(
    cache: Cache,
    private readonly downloadService: DownloadService
  ) {
    super();
    this.api = new TheRARBGApi(cache);
  }

  /**
   * Normalize a NormalizedTorrent (from detailed API) into SourceMetadata format.
   */
  private normalizaImdbPost(torrent: ImdbDetailPost, movieDetails: ImdbMetadata): SourceMetadata {
    const metadata = extractSourceMetadata({
      name: torrent.name,
      type: torrent.type,
      size: torrent.size,
      files: torrent.files,
      category: torrent.category_str,
      trackerMetadata: {
        imdbId: torrent.imdb,
        uploadDate: new Date(torrent.timestamp),
        language: torrent.language,
        season: torrent.season,
        episode: torrent.episode,
        runtime: parseInt(movieDetails.runtime, 10),
      },
    });
    return {
      audioCodec: metadata.audioCodec,
      bitrate: calculateApproximateBitrate(torrent.size, parseInt(movieDetails.runtime, 10) / 60),
      broadcasters: torrent.seeders ?? 0,
      hash: torrent.info_hash,
      language: metadata.language,
      magnetLink: this.downloadService.generateLink(
        torrent.info_hash,
        torrent.trackers
          .filter(tracker => tracker.scrape_error === null)
          .map(tracker => tracker.tracker)
      ),
      quality: metadata.quality ?? null,
      resolution: qualityToResolution(metadata.quality),
      score: 0, // ToDo: use scoringService to calculate score
      size: torrent.size,
      source: metadata.source ?? null,
      type: torrent.type,
      uploadDate: new Date(torrent.timestamp),
      url: '', // TheRARBG does not provide a direct torrent page URL
      videoCodec: metadata.videoCodec[0] ?? null,
      watchers: torrent.leechers ?? 0,
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
      sources: movie.trb_posts.map(torrent => this.normalizaImdbPost(torrent, movie.imdb)),
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
        sources: tvShow.trb_posts.map(torrent => this.normalizaImdbPost(torrent, tvShow.imdb)),
        trailerCode: '',
      };
    }

    // No torrents found
    return {
      sources: [],
      trailerCode: '',
    };
  }
}
