import type {
  AuthTokens,
  DeviceAuthCheckPending,
  DeviceAuthCheckResponse,
  DeviceAuthCheckSuccess,
  DeviceAuthResponse,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
} from '@miauflix/backend-client';
import { hcWithType } from '@miauflix/backend-client';
import { createApi } from '@reduxjs/toolkit/query/react';

import { API_URL } from '@/consts';
import type { ProfileToken } from '@/types/auth';
import { secureStorage } from '@/utils/secureStorage';

import { navigateTo, setCurrentProfile } from '../slices/app';

const client = hcWithType(API_URL);

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    login: builder.mutation<LoginResponse, LoginRequest & { profileName?: string }>({
      async queryFn({ profileName, ...credentials }, { dispatch }) {
        try {
          const res = await client.api.auth.login.$post({ json: credentials });
          if (res.status === 200) {
            const tokens: AuthTokens = await res.json();

            // Create profile-token entry
            const profileToken: ProfileToken = {
              profileId: `${credentials.email}_${Date.now()}`, // Generate unique profile ID
              profileName: profileName || credentials.email,
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
            };

            // Store the profile-token
            await secureStorage.addProfile(profileToken);

            // Set as current profile
            dispatch(setCurrentProfile(profileToken.profileId));

            // Check profile count for navigation
            const profileCount = await secureStorage.getProfileCount();
            if (profileCount > 1) {
              dispatch(navigateTo('profile-selection'));
            } else {
              dispatch(navigateTo('home/categories'));
            }

            return { data: tokens };
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
          const res = await client.api.trakt.auth.device.$post({});
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
          const res = await client.api.trakt.auth.device.check.$post({ json: { deviceCode } });
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
          const res = await client.api.auth.device.trakt.$post();
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
      { accessToken: string; refreshToken: string } | { success: false },
      { deviceCode: string }
    >({
      async queryFn({ deviceCode }) {
        try {
          const res = await client.api.trakt.auth.device.check.$post({ json: { deviceCode } });
          const data = await res.json();

          // Handle error responses
          if ('error' in data) {
            return {
              error: { status: res.status, data: data.error },
            };
          }

          // Check if it's a success response with tokens
          if ('accessToken' in data && 'refreshToken' in data) {
            return { data };
          }

          // Handle failure response
          return { data };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
    }),

    refreshToken: builder.mutation<RefreshResponse, { profileId: string }>({
      async queryFn({ profileId }, { dispatch }) {
        try {
          const profiles = await secureStorage.getProfiles();
          const profile = profiles.find(p => p.profileId === profileId);

          if (!profile) {
            return {
              error: { status: 404, data: 'Profile not found' },
            };
          }

          const res = await client.api.auth.refresh.$post({
            json: { refreshToken: profile.refreshToken },
          });

          if (res.status === 200) {
            const tokens: AuthTokens = await res.json();

            // Update stored profile with new tokens
            await secureStorage.updateProfile(profileId, {
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              expiresAt: Date.now() + 24 * 60 * 60 * 1000,
            });

            return { data: tokens };
          }

          // If refresh fails, remove the invalid profile
          await secureStorage.removeProfile(profileId);
          dispatch(navigateTo('login'));

          const data = await res.json();
          return {
            error: {
              status: res.status,
              data: 'error' in data ? data.error : 'Token refresh failed',
            },
          };
        } catch (error: any) {
          // Remove profile on error
          await secureStorage.removeProfile(profileId);
          dispatch(navigateTo('login'));
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
    }),

    logout: builder.mutation<void, { profileId: string }>({
      async queryFn({ profileId }, { dispatch }) {
        try {
          const profiles = await secureStorage.getProfiles();
          const profile = profiles.find(p => p.profileId === profileId);

          if (profile) {
            // Call backend logout
            try {
              await client.api.auth.logout.$post({
                json: { refreshToken: profile.refreshToken },
              });
            } catch (error) {
              // Continue with local cleanup even if backend call fails
              console.warn('Backend logout failed:', error);
            }

            // Remove from storage
            await secureStorage.removeProfile(profileId);
          }

          // Check if there are other profiles
          const remainingCount = await secureStorage.getProfileCount();
          if (remainingCount > 0) {
            dispatch(navigateTo('profile-selection'));
          } else {
            dispatch(navigateTo('login'));
          }

          dispatch(setCurrentProfile(undefined));

          return { data: undefined };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Logout failed' },
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
  useRefreshTokenMutation,
  useLogoutMutation,
} = authApi;

// Utility functions for token management
export const authUtils = {
  async getStoredProfiles() {
    return await secureStorage.getProfiles();
  },

  async getProfileCount() {
    return await secureStorage.getProfileCount();
  },

  async hasValidToken(profileId: string): Promise<boolean> {
    const profiles = await secureStorage.getProfiles();
    const profile = profiles.find(p => p.profileId === profileId);

    if (!profile) return false;

    // Check if token is expired (with 5 minute buffer)
    const expiresAt = profile.expiresAt || 0;
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    return Date.now() < expiresAt - bufferTime;
  },

  async getCurrentProfile(profileId?: string): Promise<ProfileToken | null> {
    if (!profileId) return null;

    const profiles = await secureStorage.getProfiles();
    return profiles.find(p => p.profileId === profileId) || null;
  },

  async clearAllProfiles() {
    await secureStorage.clearAll();
  },
};
