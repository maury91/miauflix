import { AppError } from './base.error';

type ServiceUnavailableErrorCode = 'service_unavailable';

/**
 * A remote service that is configured but cannot serve right now (not connected, or its upstream
 * is rate limiting). Unlike `ServiceNotConfiguredError`, changing settings will not fix it.
 */
export class ServiceUnavailableError extends AppError<ServiceUnavailableErrorCode> {
  constructor(
    public readonly service: string,
    /** What the service reported, e.g. that TMDB is rate limiting requests. */
    public readonly reason?: string
  ) {
    super(
      reason
        ? `Service '${service}' is unavailable: ${reason}`
        : `Service '${service}' is unavailable`,
      'configuration',
      'service_unavailable'
    );
  }
}
