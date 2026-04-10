import { AppError } from './base.error';

type RequestErrorCode = 'api_error' | 'no_solution' | 'not_configured' | 'solver_error';

export class RequestError extends AppError {
  constructor(message: string, code: RequestErrorCode) {
    super(message, 'request', code);
  }
}
