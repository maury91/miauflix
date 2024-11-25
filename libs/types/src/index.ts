import { ExtendedMovieDto, MovieDto } from './types/movies';
import { ExtendedShowDto, ShowDto } from './types/shows';

export * from './types/categories';
export * from './types/media';
export * from './types/movies';
export * from './types/pagination';
export * from './types/progress';
export * from './types/shows';
export * from './types/stream';
export * from './types/queues';
export * from './types/users';

export type MediaDto = MovieDto | ShowDto;
export type ExtendedMediaDto = ExtendedMovieDto | ExtendedShowDto;
