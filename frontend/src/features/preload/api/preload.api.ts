import { authApi } from '@features/auth/api/auth.api';
import type { MediaIntentRef, PreloadIntentResponse, ReachableIntent } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

export interface PreloadIntentRequest {
  sequence: number;
  view: 'browse' | 'details' | 'player';
  focused: MediaIntentRef | null;
  reachable: ReachableIntent[];
}

export const preloadApi = createApi({
  reducerPath: 'preloadApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    updateIntent: builder.mutation<
      PreloadIntentResponse,
      { clientId: string; intent: PreloadIntentRequest }
    >({
      async queryFn({ clientId, intent }, api) {
        const session = selectCurrentSessionId(api.getState() as RootState);
        const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
        return authenticatedRequest<PreloadIntentResponse>({
          requestFn: () =>
            backendClient.api.preload.intents[':clientId'].$put(
              { param: { clientId }, json: intent },
              { headers }
            ),
          session,
          errorContext: 'Failed to update playback preparation intent',
          onInvalidSession: () => {
            api.dispatch({ type: 'auth/clearAuth' });
            api.dispatch(
              authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true })
            );
          },
        });
      },
    }),
    removeIntent: builder.mutation<
      void,
      { clientId: string; sequence: number; session: string | null }
    >({
      async queryFn({ clientId, sequence, session }) {
        const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
        return authenticatedRequest<void>({
          requestFn: () =>
            backendClient.api.preload.intents[':clientId'].$delete(
              { param: { clientId }, query: { sequence: String(sequence) } },
              { headers }
            ),
          session,
          errorContext: 'Failed to clear playback preparation intent',
        });
      },
    }),
  }),
});

export const { useUpdateIntentMutation, useRemoveIntentMutation } = preloadApi;
