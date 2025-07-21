import type { Source } from '@miauflix/source-metadata-extractor';

export interface ShowResponse {
  type: 'show';
  id: number;
  tmdbId: number;
  imdbId: string | null;
  title: string;
  overview: string | null;
  tagline: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
  poster: string | null;
  backdrop: string | null;
  logo: string | null;
  genres: string[];
  popularity: number | null;
  rating: number | null;
  seasons: SeasonResponse[];
  sources?: Source[];
}

export interface SeasonResponse {
  id: number;
  seasonNumber: number;
  name: string;
  overview: string | null;
  airDate: string | null;
  poster: string | null;
  episodes: EpisodeResponse[];
  number: number;
}

export interface EpisodeResponse {
  id: number;
  episodeNumber: number;
  title: string;
  overview: string | null;
  airDate: string | null;
  still: string | null;
}
