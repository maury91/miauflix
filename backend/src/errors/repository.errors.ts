import { AppError } from './base.error';

type RepositoryErrorCode =
  | 'create_failed'
  | 'duplicate'
  | 'id_required'
  | 'not_found'
  | 'retrieve_failed';

export class RepositoryError extends AppError {
  constructor(message: string, code: RepositoryErrorCode) {
    super(message, 'repository', code);
  }
}
