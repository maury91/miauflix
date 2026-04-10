import { AppError } from './base.error';

type SourceErrorCode = 'invalid_response_body' | 'service_not_found';

export class SourceError extends AppError {
  constructor(message: string, code: SourceErrorCode) {
    super(message, 'source', code);
  }
}
