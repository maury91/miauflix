import { randomBytes } from 'node:crypto';

import { BUILT_IN_STATUS, ContractError } from '@miauflix/contract';
import { HTTPException } from 'hono/http-exception';

import { AuthError, InvalidTokenError, LoginError, RoleError } from '@errors/auth.errors';
import { AppError } from '@errors/base.error';
import { ServiceNotConfiguredError } from '@errors/service-not-configured.error';
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
 * Maps anything thrown while handling a request to the status and body sent back. Messages of
 * unexpected errors are not shown as the main text (they can be internal), but signed-in users
 * receive them as `detail`.
 */
export const describeError = (
  error: unknown,
  { errorId, authenticated }: { errorId: string; authenticated: boolean }
): DescribedError => {
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

  if (error instanceof ServiceNotConfiguredError) {
    const serviceName = serviceDisplayName(error.service);
    return make(
      503,
      'service_not_configured',
      error.reason
        ? `${serviceName} is not working: ${error.reason}`
        : `${serviceName} is not configured.`,
      {
        needsConfiguration: true,
        service: error.service,
        serviceName,
        hint: configurationHint(error.service),
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
        ...(authenticated && { detail: error.message }),
      });
    // A service's own message is meant for its caller (e.g. "TMDB API error: (502) Bad Gateway").
    return make(
      status,
      `service_${error.code}`,
      error.message && error.message !== error.code && error.message !== 'Internal service error'
        ? error.message
        : 'A backend service failed unexpectedly.',
      {},
      false
    );
  }

  if (error instanceof HTTPException)
    return make(error.status, `http_${error.status}`, error.message || 'Request failed');

  if (error instanceof AppError)
    return make(500, `${error.type}/${error.code}`, error.message, {}, false);

  return make(
    500,
    'internal',
    'Something went wrong on the server.',
    authenticated && error instanceof Error && error.message ? { detail: error.message } : {},
    false
  );
};
