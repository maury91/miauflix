import { AppError } from './base.error';

type ServiceNotConfiguredErrorCode = 'service_not_configured';

export class ServiceNotConfiguredError extends AppError<ServiceNotConfiguredErrorCode> {
  constructor(
    public readonly service: string,
    /** What the service reported, e.g. that an upstream API rejected its credentials. */
    public readonly reason?: string
  ) {
    super(
      reason
        ? `Service '${service}' is not available: ${reason}`
        : `Service '${service}' is not configured`,
      'configuration',
      'service_not_configured'
    );
  }
}
