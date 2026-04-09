import { AppError } from './base.error';

type MediaErrorCode = 'genre_not_found' | 'genres_failed' | 'list_not_found';

export class MediaError extends AppError {
  constructor(message: string, code: MediaErrorCode) {
    super(message, 'media', code);
  }
}
