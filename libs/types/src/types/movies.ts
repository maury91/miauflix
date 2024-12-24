import { MediaImages, VideoQualityStr } from './media';

export interface MovieDto {
  type: 'movie';
  id: number;
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

export interface TrackPlaybackRequest {
  status: 'watching' | 'stopped' | 'paused';
  type: 'movie' | 'episode';
  progress: number;
}
