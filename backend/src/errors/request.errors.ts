import { AppError } from './base.error';

type RequestErrorCode =
  | 'api_error'
  | 'no_solution'
  | 'not_configured'
  | 'response_too_large'
  | 'solver_error';

export class RequestError extends AppError {
  constructor(message: string, code: RequestErrorCode) {
    super(message, 'request', code);
  }
}
