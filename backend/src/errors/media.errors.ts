import { AppError } from '@errors/base.error';

type MediaErrorCode =
  | 'data_integrity_error'
  | 'genre_not_found'
  | 'genres_failed'
  | 'list_not_found';

export class MediaError extends AppError {
  constructor(message: string, code: MediaErrorCode) {
    super(message, 'media', code);
  }
}
