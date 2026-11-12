import { randomBytes } from 'node:crypto';

import { BUILT_IN_STATUS, ContractError } from '@miauflix/contract';
import { HTTPException } from 'hono/http-exception';

import { AuthError, InvalidTokenError, LoginError, RoleError } from '@errors/auth.errors';
import { AppError } from '@errors/base.error';
import { ServiceNotConfiguredError } from '@errors/service-not-configured.error';
import { ServiceUnavailableError } from '@errors/service-unavailable.error';
import type { ApiErrorBody } from '@routes/error.types';
import { services } from '@services/configuration/configuration.consts';

export type { ApiErrorBody };

export interface DescribedError {
  status: number;
  body: ApiErrorBody;
  /** Expected failures (auth, configuration) are logged without a stack. */
  expected: boolean;
}

/** Short id that ties an error response to its log line. */
export const newErrorId = (): string => randomBytes(4).toString('hex');

const serviceDisplayName = (service: string): string =>
  (services as Record<string, { name?: string } | undefined>)[service]?.name ?? service;

const CONFIGURATION_HINTS: Record<string, string> = {
  CATALOG:
    'An admin needs to configure TMDB: Settings → Configuration → Media Catalog (TMDB access token).',
  LIST: 'An admin needs to configure Trakt: Settings → Configuration → List Service.',
  SOURCES: 'An admin needs to configure the sources: Settings → Sources.',
  MEDIA_LOAD: 'An admin needs to check the Media load service: Settings → Configuration.',
};

const configurationHint = (service: string): string =>
  CONFIGURATION_HINTS[service] ??
  `An admin needs to configure ${serviceDisplayName(service)} in Settings → Configuration.`;

/**
 * Maps anything thrown while handling a request to the status and body sent back. Only messages
 * written for users are the main text; unexpected errors get a fixed text, and their own message
 * stays in the server log next to the error id. With `includeDetail` (admins) that message is
 * also sent as `detail`, since it can name internal paths or upstream responses.
 */
export const describeError = (
  error: unknown,
  { errorId, includeDetail = false }: { errorId: string; includeDetail?: boolean }
): DescribedError => {
  const detail = (): Partial<ApiErrorBody> => {
    if (!includeDetail) return {};
    const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    return raw ? { detail: raw } : {};
  };
  const make = (
    status: number,
    code: string,
    message: string,
    extra: Partial<ApiErrorBody> = {},
    expected = true
  ): DescribedError => ({
    status,
    expected,
    body: { success: false, status, code, error: message, message, errorId, ...extra },
  });

  // A service's reason is its own text, not vetted for every user: only admins (who can act on
  // it) get it in the message; everyone else gets fixed text, and the log has the reason.
  const reason = (service: { reason?: string }) => (includeDetail ? service.reason : undefined);

  if (error instanceof ServiceNotConfiguredError) {
    const serviceName = serviceDisplayName(error.service);
    const why = reason(error);
    return make(
      503,
      'service_not_configured',
      why ? `${serviceName} is not working: ${why}` : `${serviceName} is not configured.`,
      {
        needsConfiguration: true,
        service: error.service,
        serviceName,
        hint: configurationHint(error.service),
      }
    );
  }
  if (error instanceof ServiceUnavailableError) {
    const serviceName = serviceDisplayName(error.service);
    const why = reason(error);
    return make(
      503,
      'service_unavailable',
      why ? `${serviceName} is unavailable: ${why}` : `${serviceName} is unavailable.`,
      {
        service: error.service,
        serviceName,
        hint: `Try again in a moment. If it keeps failing, check that the ${serviceName} service is running.`,
      }
    );
  }
  if (error instanceof AuthError || error instanceof InvalidTokenError)
    return make(401, error.code, 'Authentication required');
  if (error instanceof LoginError) return make(401, error.code, 'Invalid credentials');
  if (error instanceof RoleError)
    return make(403, error.code, 'Insufficient permissions', {
      hint: 'Ask an admin to do this, or sign in with an admin profile.',
    });

  if (error instanceof ContractError) {
    if (error.code === 'not_found') return make(404, 'not_found', error.message);
    const status = BUILT_IN_STATUS[error.code as keyof typeof BUILT_IN_STATUS] ?? 500;
    if (error.code === 'timeout')
      return make(status, 'service_timeout', 'A backend service took too long to answer.', {
        hint: 'Try again in a moment.',
        ...detail(),
      });
    // Any other service message may carry internal details: only the log and `detail` get it.
    return make(
      status,
      `service_${error.code}`,
      'A backend service failed unexpectedly.',
      detail(),
      false
    );
  }

  if (error instanceof HTTPException)
    // 5xx messages can come from middleware internals; 4xx ones are written for the client.
    return error.status >= 500
      ? make(
          error.status,
          `http_${error.status}`,
          'Something went wrong on the server.',
          detail(),
          false
        )
      : make(error.status, `http_${error.status}`, error.message || 'Request failed');

  // The type/code says what failed; the message stays in the log (by error id) and `detail`.
  if (error instanceof AppError)
    return make(
      500,
      `${error.type}/${error.code}`,
      'Something went wrong on the server.',
      detail(),
      false
    );

  return make(500, 'internal', 'Something went wrong on the server.', detail(), false);
};
