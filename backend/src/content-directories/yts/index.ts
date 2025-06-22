import {
  calculateApproximateBitrate,
  detectAudioCodecFromChannels,
  qualityToResolution,
} from '@miauflix/source-metadata-extractor';
import type { Cache } from 'cache-manager';

import type { SourceMetadata } from '@content-directories/content-directory.abstract';
import { AbstractContentDirectory } from '@content-directories/content-directory.abstract';

import { YTSApi } from './yts.api';
import type { YTSSourceMetadata } from './yts.types';
import { mapYTSVideoCodec } from './yts.utils';

export class YTSContentDirectory extends AbstractContentDirectory<YTSApi> {
  protected readonly api: YTSApi;

  constructor(cache: Cache) {
    super();
    this.api = new YTSApi(cache);
  }

  private normalize = (
    torrent: YTSSourceMetadata,
    movieTitle: string,
    runtime: number
  ): SourceMetadata => {
    const resolution = qualityToResolution(undefined); // YTS quality mapping needs to be implemented
    const videoCodec = mapYTSVideoCodec(torrent.video_codec, torrent.bit_depth);
    const audioCodec = detectAudioCodecFromChannels(torrent.audio_channels);

    return {
      audioCodec: audioCodec ? [audioCodec] : [],
      bitrate: calculateApproximateBitrate(torrent.size_bytes, runtime),
      broadcasters: torrent.seeds,
      hash: torrent.hash,
      language: [],
      magnetLink: `magnet:?xt=urn:btih:${torrent.hash}&dn=${encodeURIComponent(movieTitle)}`,
      quality: null, // ToDo: YTS quality mapping needs to be implemented
      resolution,
      score: 0,
      size: torrent.size_bytes,
      source: null, // ToDo: YTS source mapping needs to be implemented
      type: torrent.type,
      uploadDate: new Date(torrent.date_uploaded),
      url: torrent.url,
      videoCodec,
      watchers: torrent.peers,
    };
  };

  async getMovie(imdbId: string, highPriority?: boolean) {
    const response = await this.api.searchMovies(imdbId, 1, 20, highPriority);

    if (!response.data.movie_count || !response.data.movies.length) {
      return { sources: [], trailerCode: '' };
    }

    const movie = response.data.movies[0];
    return {
      sources: movie.torrents.map(torrent =>
        this.normalize(torrent, movie.title_long, movie.runtime)
      ),
      trailerCode: movie.yt_trailer_code || '',
    };
  }
}
