import { AppError } from '@errors/base.error';

export class ErrorWithStatus extends AppError {
  constructor(
    message: string,
    public status: string
  ) {
    super(message, 'source', status);
    this.name = 'ErrorWithStatus';
  }
}
