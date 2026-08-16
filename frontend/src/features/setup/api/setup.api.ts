import type { LoginResponse, SetupStatusResponse } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { backendClient } from '@shared/api/backend-client';

async function handleSetupRequest<T>(
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

export const setupApi = createApi({
  reducerPath: 'setupApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    checkSetupStatus: builder.query<SetupStatusResponse, void>({
      async queryFn() {
        return handleSetupRequest<SetupStatusResponse>(
          () => backendClient.api.auth.setup.$get(),
          'Setup status check failed'
        );
      },
    }),

    createAdmin: builder.mutation<LoginResponse, { email: string; password: string }>({
      async queryFn(credentials) {
        return handleSetupRequest<LoginResponse>(
          () => backendClient.api.auth.setup.$post({ json: credentials }),
          'Admin creation failed'
        );
      },
    }),
  }),
});

export const { useCheckSetupStatusQuery, useCreateAdminMutation } = setupApi;
