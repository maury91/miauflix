import type { ConfigEntryView, UpdateConfigsResult } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

async function handleConfigRequest<T>(
  requestFn: () => Promise<Response>,
  errorContext: string
): Promise<{ data: T } | { error: { status: number; data: string } }> {
  try {
    const res = await requestFn();
    if (res.status >= 200 && res.status < 300) {
      const data: T = await res.json();
      return { data };
    }

    const responseData = await res.json();
    const errorMessage =
      'error' in responseData && typeof responseData.error === 'string'
        ? responseData.error
        : errorContext;
    return { error: { status: res.status, data: errorMessage } };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStatus = (error as { status?: number })?.status || 500;
    return { error: { status: errorStatus, data: errorMessage } };
  }
}

export const configApi = createApi({
  reducerPath: 'configApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  tagTypes: ['Config'],
  endpoints: builder => ({
    getConfig: builder.query<ConfigEntryView[], void>({
      providesTags: ['Config'],
      async queryFn(_arg, { getState }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return handleConfigRequest<ConfigEntryView[]>(
          () => backendClient.api.config.$get({}, { headers }),
          'Failed to fetch config'
        );
      },
    }),

    updateConfig: builder.mutation<
      { success: boolean; restarting: string[]; needsProcessRestart: string[] },
      { entries: { key: string; value: string }[] }
    >({
      invalidatesTags: ['Config'],
      async queryFn({ entries }, { getState }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return handleConfigRequest<UpdateConfigsResult>(
          () => backendClient.api.config.$put({ json: { entries } }, { headers }),
          'Failed to update config'
        ) as Promise<
          | { data: { success: boolean; restarting: string[]; needsProcessRestart: string[] } }
          | { error: { status: number; data: string } }
        >;
      },
    }),

    restartService: builder.mutation<{ success: boolean }, { service: string }>({
      async queryFn({ service }, { getState }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return handleConfigRequest<{ success: boolean }>(
          () =>
            backendClient.api.config[':service'].restart.$post({ param: { service } }, { headers }),
          'Failed to restart service'
        );
      },
    }),
  }),
});

export const { useGetConfigQuery, useUpdateConfigMutation, useRestartServiceMutation } = configApi;
