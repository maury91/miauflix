import { AppError } from './base.error';

type ServiceNotConfiguredErrorCode = 'service_not_configured';

export class ServiceNotConfiguredError extends AppError<ServiceNotConfiguredErrorCode> {
  constructor(public readonly service: string) {
    super(`Service '${service}' is not configured`, 'configuration', 'service_not_configured');
  }
}
