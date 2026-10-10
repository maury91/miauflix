import type {
  ConnectionResult,
  ProviderAssociation,
  ProviderAuthorization,
} from '@miauflix/service-contracts';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';

/**
 * Start Trakt device authorization for the current user and return its code and polling details.
 * The session ID is used for authentication refresh; request failures are returned as error results.
 */
export const beginTraktAssociation = (
  session: string
): Promise<{ data: ProviderAuthorization } | { error: { status: number; data: string } }> =>
  authenticatedRequest({
    requestFn: () =>
      backendClient.api.integrations.trakt.authorization.$post(
        {},
        { headers: { 'X-Session-Id': session } }
      ),
    session,
    errorContext: 'Unable to start Trakt association',
  });

/**
 * Check one device authorization for the current user; this call does not schedule further polls.
 * The session ID is used for authentication refresh; request failures are returned as error results.
 */
export const pollTraktAssociation = (
  authorizationId: string,
  session: string
): Promise<{ data: ConnectionResult } | { error: { status: number; data: string } }> =>
  authenticatedRequest({
    requestFn: () =>
      backendClient.api.integrations.trakt.authorization[':authorizationId'].check.$post(
        { param: { authorizationId } },
        { headers: { 'X-Session-Id': session } }
      ),
    session,
    errorContext: 'Unable to check Trakt association',
  });

/**
 * Read the current user’s Trakt connection status.
 * The session ID is used for authentication refresh; request failures are returned as error results.
 */
export const getTraktAssociation = (
  session: string
): Promise<{ data: ProviderAssociation } | { error: { status: number; data: string } }> =>
  authenticatedRequest({
    requestFn: () =>
      backendClient.api.integrations.trakt.association.$get(
        {},
        { headers: { 'X-Session-Id': session } }
      ),
    session,
    errorContext: 'Unable to load Trakt association',
  });

/**
 * Disconnect the current user’s Trakt account and return its resulting association status.
 * The session ID is used for authentication refresh; request failures are returned as error results.
 */
export const disconnectTrakt = (
  session: string
): Promise<{ data: ProviderAssociation } | { error: { status: number; data: string } }> =>
  authenticatedRequest({
    requestFn: () =>
      backendClient.api.integrations.trakt.association.$delete(
        {},
        { headers: { 'X-Session-Id': session } }
      ),
    session,
    errorContext: 'Unable to disconnect Trakt',
  });
