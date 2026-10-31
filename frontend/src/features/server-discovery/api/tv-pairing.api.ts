import { authApi } from '@features/auth/api/auth.api';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

const sessionHeaders = (
  state: unknown
): { session: string | null; headers: Record<string, string> } => {
  const session = selectCurrentSessionId(state as RootState);
  return { session, headers: session ? { 'X-Session-Id': session } : {} };
};

/** Pairing a TV app from the web app: the backend relays the address under the TV's code. */
export const tvPairingApi = createApi({
  reducerPath: 'tvPairingApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    getTvPairingStatus: builder.query<{ enabled: boolean }, void>({
      async queryFn(_arg, api) {
        const { session, headers } = sessionHeaders(api.getState());
        return authenticatedRequest<{ enabled: boolean }>({
          requestFn: () => backendClient.api.tv.pairing.$get({}, { headers }),
          session,
          errorContext: 'Failed to check TV pairing',
          onInvalidSession: () => {
            api.dispatch({ type: 'auth/clearAuth' });
            api.dispatch(
              authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true })
            );
          },
        });
      },
    }),
    pairTv: builder.mutation<{ paired: true }, { code: string; url: string }>({
      async queryFn({ code, url }, api) {
        const { session, headers } = sessionHeaders(api.getState());
        return authenticatedRequest<{ paired: true }>({
          requestFn: () =>
            backendClient.api.tv.pairings[':code'].$post(
              { param: { code }, json: { url } },
              { headers }
            ),
          session,
          errorContext: 'Failed to pair the TV',
          onInvalidSession: () => {
            api.dispatch({ type: 'auth/clearAuth' });
            api.dispatch(
              authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true })
            );
          },
        });
      },
    }),
  }),
});

export const { useGetTvPairingStatusQuery, usePairTvMutation } = tvPairingApi;
