import type {
  AudioCodec,
  Language,
  Quality,
  Source,
  VideoCodec,
} from '@miauflix/source-metadata-extractor';

import type { Api, ApiStatus } from '@utils/api.util';

export interface SourceMetadata {
  audioCodec: AudioCodec[];
  bitrate: number;
  broadcasters: number;
  hash: string;
  language: Language[];
  magnetLink: string;
  /* Quality of the source ( 1080p, 720p, etc ) */
  quality: Quality | null;
  score: number;
  size: number;
  /* Where the media is coming from ( WEB, YTS, etc ) */
  source: Source | null;
  uploadDate: Date;
  url: string;
  /* Video codec of the source ( x264, x265, etc ) */
  videoCodec: VideoCodec | null;
  watchers: number;
}

export abstract class AbstractContentDirectory<T extends Api = Api> {
  protected api: T;

  abstract name: string;

  abstract getMovie(
    imdbId: string,
    highPriority?: boolean
  ): Promise<{ sources: SourceMetadata[]; trailerCode: string }>;

  public status(): ApiStatus {
    return this.api.status();
  }
}
