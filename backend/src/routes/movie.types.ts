import type { Source, VideoCodec } from '@miauflix/source-metadata-extractor';
import type { Quality } from '@miauflix/source-metadata-extractor';

export interface MovieSourceDto {
  id: number;
  quality: Quality | '3D' | null;
  size: number;
  videoCodec: VideoCodec | null;
  broadcasters: number | null;
  watchers: number | null;
  source: Source | null;
  hasDataFile: boolean;
}

export interface MovieResponse {
  type: 'movie';
  id: number;
  tmdbId: number;
  imdbId: string | null;
  title: string;
  overview: string;
  tagline: string;
  releaseDate: string;
  runtime: number;
  poster: string;
  backdrop: string;
  logo: string;
  genres: string[];
  popularity: number;
  rating: number;
  sources?: MovieSourceDto[];
}

export interface StreamingKeyResponse {
  streamingKey: string;
  quality: Quality | '3D' | null;
  size: number;
  videoCodec: VideoCodec | null;
  broadcasters: number | null;
  watchers: number | null;
  expiresAt: Date;
}
