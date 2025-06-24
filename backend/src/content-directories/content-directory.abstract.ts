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
  quality: Quality | null;
  resolution: { width: number; height: number; label: string };
  score: number;
  size: number;
  source: Source | null;
  type: string;
  uploadDate: Date;
  url: string;
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
