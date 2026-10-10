import { authApi } from '@features/auth/api/auth.api';
import type { StorageInventoryResponse } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

export const storageApi = createApi({
  reducerPath: 'storageApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  tagTypes: ['Storage'],
  endpoints: builder => ({
    getStorageInventory: builder.query<StorageInventoryResponse, void>({
      providesTags: ['Storage'],
      async queryFn(_arg, api) {
        const session = selectCurrentSessionId(api.getState() as RootState);
        const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
        return authenticatedRequest<StorageInventoryResponse>({
          requestFn: () => backendClient.api.storage.$get({}, { headers }),
          session,
          errorContext: 'Failed to load storage',
          onInvalidSession: () => {
            api.dispatch({ type: 'auth/clearAuth' });
            api.dispatch(
              authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true })
            );
          },
        });
      },
    }),
    removeStorage: builder.mutation<{ success: true }, number>({
      invalidatesTags: ['Storage'],
      async queryFn(movieSourceId, api) {
        const session = selectCurrentSessionId(api.getState() as RootState);
        const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
        return authenticatedRequest<{ success: true }>({
          requestFn: () =>
            backendClient.api.storage[':movieSourceId'].$delete(
              { param: { movieSourceId: String(movieSourceId) } },
              { headers }
            ),
          session,
          errorContext: 'Failed to free storage',
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

export const { useGetStorageInventoryQuery, useRemoveStorageMutation } = storageApi;
