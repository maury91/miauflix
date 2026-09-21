import type {
  ConnectionResult,
  ProviderAssociation,
  ProviderAuthorization,
} from '@miauflix/service-contracts';
import { request } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';

export const beginTraktAssociation = (): Promise<
  { data: ProviderAuthorization } | { error: { status: number; data: string } }
> =>
  request(
    () => backendClient.api.integrations.trakt.authorization.$post(),
    'Unable to start Trakt association'
  );

export const pollTraktAssociation = (
  authorizationId: string
): Promise<{ data: ConnectionResult } | { error: { status: number; data: string } }> =>
  request(
    () =>
      backendClient.api.integrations.trakt.authorization[':authorizationId'].check.$post({
        param: { authorizationId },
      }),
    'Unable to check Trakt association'
  );

export const getTraktAssociation = (): Promise<
  { data: ProviderAssociation } | { error: { status: number; data: string } }
> =>
  request(
    () => backendClient.api.integrations.trakt.association.$get(),
    'Unable to load Trakt association'
  );

export const disconnectTrakt = (): Promise<
  { data: ProviderAssociation } | { error: { status: number; data: string } }
> =>
  request(
    () => backendClient.api.integrations.trakt.association.$delete(),
    'Unable to disconnect Trakt'
  );
