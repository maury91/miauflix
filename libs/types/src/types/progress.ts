import { MovieDto } from './movies';
import { ShowDto } from './shows';

export interface MovieProgressDto {
  progress: number;
  pausedAt: string;
  type: 'movie';
  movie: MovieDto;
}

export interface ShowProgressDto {
  progress: number;
  pausedAt: string;
  type: 'episode';
  episode: number;
  season: number;
  show: ShowDto;
}

export type ProgressDto = MovieProgressDto[];
