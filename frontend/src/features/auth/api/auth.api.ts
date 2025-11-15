import type {
  DeviceAuthCheckPending,
  DeviceAuthCheckSuccess,
  DeviceAuthResponse,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
} from '@miauflix/backend';
import { hcWithType } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { API_URL } from '@shared/config/constants';
import type { SessionInfo } from '@store/slices/auth';

const client = hcWithType(API_URL, {
  init: {
    credentials: 'include',
  },
});

async function handleAuthRequest<T>(
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
    return {
      error: {
        status: res.status,
        data: errorMessage,
      },
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStatus = (error as { status?: number })?.status || 500;
    return {
      error: { status: errorStatus, data: errorMessage },
    };
  }
}

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      async queryFn(credentials) {
        return handleAuthRequest<LoginResponse>(
          () => client.api.auth.login.$post({ json: credentials }),
          'Login failed'
        );
      },
    }),

    refresh: builder.mutation<RefreshResponse, { session: string }>({
      async queryFn({ session }) {
        return handleAuthRequest<RefreshResponse>(
          () => client.api.auth.refresh[':session'].$post({ param: { session } }),
          'Refresh failed'
        );
      },
    }),

    logout: builder.mutation<{ message: string }, { session: string }>({
      async queryFn({ session }) {
        return handleAuthRequest<{ message: string }>(
          () => client.api.auth.logout[':session'].$post({ param: { session } }),
          'Logout failed'
        );
      },
    }),

    listSessions: builder.query<SessionInfo[], void>({
      async queryFn() {
        return handleAuthRequest<SessionInfo[]>(
          () => client.api.auth.sessions.$get(),
          'List sessions failed'
        );
      },
    }),

    deviceLogin: builder.mutation<DeviceAuthResponse, void>({
      async queryFn() {
        return handleAuthRequest<DeviceAuthResponse>(
          () => client.api.auth.device.trakt.$post(),
          'Device login failed'
        );
      },
    }),

    checkDeviceLoginStatus: builder.mutation<
      DeviceAuthCheckPending | DeviceAuthCheckSuccess,
      { deviceCode: string }
    >({
      async queryFn({ deviceCode }) {
        return handleAuthRequest<DeviceAuthCheckPending | DeviceAuthCheckSuccess>(
          () => client.api.trakt.auth.device.check.$post({ json: { deviceCode } }),
          'Device login check failed'
        );
      },
    }),
  }),
});

export const {
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
  useListSessionsQuery,
  useDeviceLoginMutation,
  useCheckDeviceLoginStatusMutation,
} = authApi;
