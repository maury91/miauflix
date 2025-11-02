import type {
  DeviceAuthResponse,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  UserDto,
} from '@miauflix/backend-client';
import { hcWithType } from '@miauflix/backend-client';
import { createApi } from '@reduxjs/toolkit/query/react';
import { API_URL } from '@shared/config/constants';
import type { SessionInfo } from '@store/slices/auth';

const client = hcWithType(API_URL, {
  init: {
    credentials: 'include',
  },
});

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      async queryFn(credentials) {
        try {
          const res = await client.api.auth.login.$post({ json: credentials });
          if (res.status === 200) {
            const loginData: LoginResponse = await res.json();
            return { data: loginData };
          }

          const data = await res.json();
          const errorMessage =
            'error' in data && typeof data.error === 'string' ? data.error : 'Login failed';
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
      },
    }),

    refresh: builder.mutation<RefreshResponse, { session: string }>({
      async queryFn({ session }) {
        try {
          const res = await client.api.auth.refresh[':session'].$post({
            param: { session },
          });
          if (res.status === 200) {
            const refreshData = await res.json();
            const typedData = refreshData as RefreshResponse;
            return { data: typedData };
          }

          const data = await res.json();
          const errorMessage =
            'error' in data && typeof data.error === 'string' ? data.error : 'Refresh failed';
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
      },
    }),

    logout: builder.mutation<{ message: string }, { session: string }>({
      async queryFn({ session }) {
        try {
          const res = await client.api.auth.logout[':session'].$post(
            {
              param: { session },
            },
            {
              headers: {
                'X-Session-Id': session,
              },
            }
          );
          if (res.status === 200) {
            return { data: await res.json() };
          }

          const data = await res.json();
          const errorMessage =
            'error' in data && typeof data.error === 'string' ? data.error : 'Logout failed';
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
      },
    }),

    listSessions: builder.query<SessionInfo[], void>({
      async queryFn() {
        try {
          const res = await client.api.auth.sessions.$get();
          if (res.status === 200) {
            const sessions: SessionInfo[] = await res.json();
            return { data: sessions };
          }

          const data = await res.json();
          const errorMessage =
            'error' in data && typeof data.error === 'string'
              ? data.error
              : 'Failed to list sessions';
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
      },
    }),

    deviceLogin: builder.mutation<DeviceAuthResponse, void>({
      async queryFn() {
        try {
          const res = await client.api.auth.device.trakt.$post();
          const data = await res.json();

          if ('error' in data) {
            const errorMessage =
              typeof data.error === 'string' ? data.error : 'Device login failed';
            return {
              error: { status: 400, data: errorMessage },
            };
          }

          return {
            data,
          };
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorStatus = (error as { status?: number })?.status || 500;
          return {
            error: { status: errorStatus, data: errorMessage },
          };
        }
      },
    }),

    checkDeviceLoginStatus: builder.mutation<
      | {
          success: true;
          session: string;
          user: UserDto;
        }
      | { success: false; pending: true },
      { deviceCode: string }
    >({
      async queryFn({ deviceCode }) {
        try {
          const res = await client.api.trakt.auth.device.check.$post({ json: { deviceCode } });
          const data = await res.json();

          if ('error' in data) {
            const errorMessage =
              typeof data.error === 'string' ? data.error : 'Device login check failed';
            return {
              error: { status: res.status, data: errorMessage },
            };
          }

          if ('success' in data && data.success === true) {
            return { data };
          }

          return { data };
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorStatus = (error as { status?: number })?.status || 500;
          return {
            error: { status: errorStatus, data: errorMessage },
          };
        }
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
