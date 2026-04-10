import { AppError } from '@errors/base.error';

type SchedulerErrorCode = 'already_scheduled' | 'not_scheduled';

export class SchedulerError extends AppError {
  constructor(message: string, code: SchedulerErrorCode) {
    super(message, 'scheduler', code);
  }
}
