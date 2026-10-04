import type {
  ConnectionResult,
  ProviderAssociation,
  ProviderAuthorization,
} from '@miauflix/service-contracts';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';

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
