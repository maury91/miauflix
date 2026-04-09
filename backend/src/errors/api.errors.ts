import { AppError } from './base.error';

type ApiErrorCode =
  | 'connection_error'
  | 'http_error'
  | 'invalid_response'
  | 'not_configured'
  | 'response_error'
  | 'timeout'
  | 'validation_error';

export class ApiError extends AppError {
  constructor(
    message: string,
    code: ApiErrorCode,
    public readonly service?: string,
    public readonly status?: number
  ) {
    super(message, 'api', code);
  }
}
