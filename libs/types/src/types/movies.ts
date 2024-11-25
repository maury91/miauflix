import { MediaImages, VideoQualityStr } from './media';

export interface MovieDto {
  type: 'movie';
  id: string;
  title: string;
  year: number;
  ids: {
    trakt: number;
    slug: string;
    imdb: string;
    tmdb: number;
  };
  sourceFound: boolean | null;
  noSourceFound: boolean | null;
  images: MediaImages;
}

export interface ExtendedMovieDto extends MovieDto {
  overview: string;
  runtime: number;
  trailer: string;
  rating: number;
  genres: string[];
  qualities: VideoQualityStr[];
}

export interface TrackMoviePlaybackRequest {
  action: 'start' | 'pause' | 'stop';
  progress: number;
}
