import type { VideoCodec } from '@miauwatch/source-metadata-extractor';
import type { Quality } from '@miauwatch/source-metadata-extractor';

export interface StreamParams {
  token: string;
}

export interface StreamQuery {
  quality?: Quality | 'auto';
  hevc?: boolean;
}

export interface StreamSourceDto {
  id: number;
  quality: Quality | '3D' | null;
  size: number;
  videoCodec: VideoCodec | null;
}

export interface StreamResponse {
  status: string;
  source: StreamSourceDto;
}
