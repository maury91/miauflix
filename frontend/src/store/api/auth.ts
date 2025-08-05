import type {
  DeviceAuthCheckPending,
  DeviceAuthCheckResponse,
  DeviceAuthCheckSuccess,
  DeviceAuthResponse,
  LoginRequest,
  LoginResponse,
} from '@miauflix/backend-client';
import { hcWithType } from '@miauflix/backend-client';
import { createApi } from '@reduxjs/toolkit/query/react';

import { API_URL } from '../../consts';
import { navigateTo } from '../slices/app';

const client = hcWithType(API_URL);

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      async queryFn(credentials, { dispatch }) {
        try {
          const res = await client.auth.login.$post({ json: credentials });
          if (res.status === 200) {
            const data = await res.json();
            dispatch(navigateTo('profile-selection'));
            return { data };
          }
          const data = await res.json();
          return {
            error: {
              status: res.status,
              data: 'error' in data ? data.error : 'Login failed',
            },
          };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
    }),
    getDeviceCode: builder.mutation<DeviceAuthResponse, void>({
      async queryFn() {
        try {
          const res = await client.trakt.auth.device.$post({});
          if (res.status === 200) {
            const data = await res.json();
            return { data };
          }
          const data = await res.json();
          return {
            error: {
              status: 500,
              data: 'error' in data ? data.error : 'Device code generation failed',
            },
          };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
    }),
    checkAuthStatus: builder.mutation<DeviceAuthCheckResponse, { deviceCode: string }>({
      async queryFn({ deviceCode }, { dispatch }) {
        try {
          const res = await client.trakt.auth.device.check.$post({ json: { deviceCode } });
          if (res.status === 200) {
            const data: DeviceAuthCheckPending | DeviceAuthCheckSuccess = await res.json();
            if ('accessToken' in data) {
              dispatch(navigateTo('profile-selection'));
            }
            return { data };
          }
          const data = await res.json();
          return {
            error: {
              status: 500,
              data: 'error' in data ? data.error : 'Device code generation failed',
            },
          };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
    }),
    deviceLogin: builder.mutation<DeviceAuthResponse, void>({
      async queryFn() {
        try {
          const res = await client.auth.device.trakt.$post();
          const data = await res.json();

          if ('error' in data) {
            return {
              error: { status: 400, data: data.error },
            };
          }

          return {
            data,
          };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
    }),

    checkDeviceLoginStatus: builder.mutation<
      { accessToken: string; refreshToken: string } | { success: false; error: string },
      { deviceCode: string }
    >({
      async queryFn({ deviceCode }) {
        try {
          const res = await client.auth.login.trakt.$post({ json: { deviceCode } });
          const data = await res.json();

          // Handle error responses
          if ('error' in data) {
            return {
              error: { status: 400, data: data.error },
            };
          }

          // Check if it's a success response with tokens
          if ('accessToken' in data && 'refreshToken' in data) {
            return { data: data as { accessToken: string; refreshToken: string } };
          }

          // Handle failure response
          return { data: data as { success: false; error: string } };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
    }),
  }),
});

export const {
  useLoginMutation,
  useGetDeviceCodeMutation,
  useCheckAuthStatusMutation,
  useDeviceLoginMutation,
  useCheckDeviceLoginStatusMutation,
} = authApi;
