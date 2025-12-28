import {
  calculateApproximateBitrate,
  detectAudioCodecFromChannels,
} from '@miauflix/source-metadata-extractor';
import type { Cache } from 'cache-manager';

import type { SourceMetadata } from '@content-directories/content-directory.abstract';
import { AbstractContentDirectory } from '@content-directories/content-directory.abstract';
import type { RequestService } from '@services/request/request.service';

import { YTSApi } from './yts.api';
import type { YTSSourceMetadata } from './yts.types';
import { mapYTSQuality, mapYTSTypeToSource, mapYTSVideoCodec } from './yts.utils';

export class YTSContentDirectory extends AbstractContentDirectory<YTSApi> {
  protected readonly api: YTSApi;

  constructor(cache: Cache, requestService: RequestService) {
    super();
    this.api = new YTSApi(cache, requestService);
  }

  name = 'YTS';

  private normalize = (
    sourceMetadata: YTSSourceMetadata,
    movieTitle: string,
    runtime: number
  ): SourceMetadata => {
    const videoCodec = mapYTSVideoCodec(sourceMetadata.video_codec, sourceMetadata.bit_depth);
    const audioCodec = detectAudioCodecFromChannels(sourceMetadata.audio_channels);
    const source = mapYTSTypeToSource(sourceMetadata.type);
    const quality = mapYTSQuality(sourceMetadata, runtime);

    return {
      audioCodec: audioCodec ? [audioCodec] : [],
      bitrate: calculateApproximateBitrate(sourceMetadata.size_bytes, runtime),
      broadcasters: sourceMetadata.seeds,
      hash: sourceMetadata.hash,
      language: [],
      magnetLink: `magnet:?xt=urn:btih:${sourceMetadata.hash}&dn=${encodeURIComponent(movieTitle)}`,
      quality,
      is3D: sourceMetadata.quality.toLowerCase().trim() === '3d',
      score: 0,
      size: sourceMetadata.size_bytes,
      source,
      uploadDate: new Date(sourceMetadata.date_uploaded),
      url: sourceMetadata.url,
      videoCodec,
      watchers: sourceMetadata.peers,
    };
  };

  async getMovie(imdbId: string, highPriority?: boolean) {
    const response = await this.api.searchMovies(imdbId, 1, 20, highPriority);

    if (!response.data.movie_count || !response.data.movies.length) {
      return { sources: [], trailerCode: '' };
    }

    const movie = response.data.movies[0];
    return {
      sources: movie.torrents.map(sourceMetadata =>
        this.normalize(sourceMetadata, movie.title_long, movie.runtime)
      ),
      trailerCode: movie.yt_trailer_code || '',
    };
  }
}
