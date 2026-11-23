import type { BackdropFocus } from '@miauwatch/service-contracts';
import type { Source, VideoCodec } from '@miauwatch/source-metadata-extractor';
import type { Quality } from '@miauwatch/source-metadata-extractor';

import type { SourceAvailability } from '@services/source/source-availability.service';

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
  mediaId: number;
  imdbId: string | null;
  title: string;
  overview: string;
  tagline: string;
  releaseDate: string;
  runtime: number;
  poster: string;
  backdrop: string;
  backdropFocus: BackdropFocus | null;
  logo: string;
  heroLogo?: string;
  artworkRevision?: number;
  cardLogoStatus?: 'failed' | 'pending' | 'ready';
  heroLogoStatus?: 'failed' | 'pending' | 'ready';
  genres: string[];
  /** ISO 639-1 language the title was made in; null when unknown. */
  originalLanguage: string | null;
  /** Japanese animation: the anime language preferences apply. */
  anime: boolean;
  popularity: number;
  rating: number;
  /** `unavailable` once every source found proved fake, or the finished search found none. */
  sourceAvailability: SourceAvailability;
  sources?: MovieSourceDto[];
}
