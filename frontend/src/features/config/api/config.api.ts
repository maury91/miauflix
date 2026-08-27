import { authApi } from '@features/auth/api/auth.api';
import type { ConfigEntryView, SaveConfigsResult, TestConfigsResult } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest, request } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

export type ServiceStatuses = Record<string, { status: string }>;
type SystemStatusResponse = { services: ServiceStatuses };
type ConfigEntriesRequest = { entries: { key: string; value: string }[] };

export const configApi = createApi({
  reducerPath: 'configApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  tagTypes: ['Config', 'ServiceStatus'],
  endpoints: builder => ({
    getConfig: builder.query<ConfigEntryView[], void>({
      providesTags: ['Config'],
      async queryFn(_arg, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<ConfigEntryView[]>({
          requestFn: () => backendClient.api.config.$get({}, { headers }),
          session: sessionId,
          errorContext: 'Failed to fetch config',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
    }),

    getServiceStatuses: builder.query<ServiceStatuses, void>({
      providesTags: ['ServiceStatus'],
      async queryFn() {
        return request<SystemStatusResponse>(
          () => backendClient.api.status.$get(),
          'Failed to fetch service status'
        ).then(result => {
          if ('data' in result) {
            return { data: result.data['services'] };
          }
          return result;
        });
      },
    }),

    updateConfig: builder.mutation<SaveConfigsResult, ConfigEntriesRequest>({
      invalidatesTags: ['Config', 'ServiceStatus'],
      async queryFn({ entries }, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<SaveConfigsResult>({
          requestFn: () => backendClient.api.config.$put({ json: { entries } }, { headers }),
          session: sessionId,
          errorContext: 'Failed to update config',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
    }),

    testServiceConfig: builder.mutation<
      TestConfigsResult,
      ConfigEntriesRequest & { service: string }
    >({
      async queryFn({ service, entries }, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<TestConfigsResult>({
          requestFn: () =>
            backendClient.api.config[':service'].test.$post(
              { param: { service }, json: { entries } },
              { headers }
            ),
          session: sessionId,
          errorContext: `Failed to test ${service} configuration`,
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
    }),

    saveServiceConfig: builder.mutation<
      SaveConfigsResult,
      ConfigEntriesRequest & { service: string }
    >({
      invalidatesTags: ['Config', 'ServiceStatus'],
      async queryFn({ service, entries }, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<SaveConfigsResult>({
          requestFn: () =>
            backendClient.api.config[':service'].$put(
              { param: { service }, json: { entries } },
              { headers }
            ),
          session: sessionId,
          errorContext: `Failed to save ${service} configuration`,
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
    }),

    restartService: builder.mutation<{ success: boolean }, { service: string }>({
      invalidatesTags: ['ServiceStatus'],
      async queryFn({ service }, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<{ success: boolean }>({
          requestFn: () =>
            backendClient.api.config[':service'].restart.$post({ param: { service } }, { headers }),
          session: sessionId,
          errorContext: 'Failed to restart service',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
    }),
  }),
});

export const {
  useGetConfigQuery,
  useGetServiceStatusesQuery,
  useUpdateConfigMutation,
  useTestServiceConfigMutation,
  useSaveServiceConfigMutation,
  useRestartServiceMutation,
} = configApi;
