import { MovieDto } from './movies';

export interface MovieProgressDto {
  progress: number;
  pausedAt: string;
  type: 'movie';
  movie: MovieDto;
}

export type ProgressDto = MovieProgressDto[];
