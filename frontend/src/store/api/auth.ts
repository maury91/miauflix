import type {
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
import { accessTokenStorage, getStorageMode } from '@/utils/accessTokenStorage';
import { secureStorage } from '@/utils/storage';

import { navigateTo, setCurrentProfile } from '../slices/app';
import type { RootState } from '../store';

// Access token storage utility functions
const getAccessToken = (sessionId?: string): string | null => {
  if (!sessionId) return null;
  const tokenData = accessTokenStorage.retrieve(sessionId);
  return tokenData?.accessToken || null;
};

const getCurrentUser = (sessionId?: string): { id: string; email: string; role: string } | null => {
  if (!sessionId) return null;
  const tokenData = accessTokenStorage.retrieve(sessionId);
  return tokenData?.user || null;
};

const getTokenDataBySession = (sessionId: string) => {
  return accessTokenStorage.retrieve(sessionId);
};

const storeTokenData = (
  accessToken: string,
  user: { id: string; email: string; role: string },
  session: string
): void => {
  accessTokenStorage.store({ accessToken, user, session, timestamp: Date.now() });
};

const clearTokenData = (sessionId?: string): void => {
  if (sessionId) {
    accessTokenStorage.remove(sessionId);
  } else {
    accessTokenStorage.clear();
  }
};

const getAllStoredSessions = (): string[] => {
  return accessTokenStorage.getAllSessions();
};

// Log storage mode for debugging
console.log(`🔒 Access token storage mode: ${getStorageMode()}`);

// Create client with credentials for cookie handling
const client = hcWithType(API_URL, {
  init: {
    credentials: 'include',
  },
});

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    login: builder.mutation<LoginResponse, LoginRequest & { profileName?: string }>({
      async queryFn({ profileName, ...credentials }, { dispatch }) {
        try {
          const res = await client.api.auth.login.$post({ json: credentials });
          if (res.status === 200) {
            const loginData: LoginResponse = await res.json();

            // Store access token, user, and session
            storeTokenData(loginData.accessToken, loginData.user, loginData.session);

            // Create profile entry (for user management, not token storage)
            const profileToken: ProfileToken = {
              profileId: loginData.session, // Use session as profile ID for proper identification
              profileName: profileName || loginData.user.email,
              expiresAt: Date.now() + 24 * 60 * 60 * 1000, // For UI purposes
            };

            // Store the profile metadata securely (no tokens)
            await secureStorage.addProfile(profileToken);

            // Set as current profile
            // FixMe: do not use dispatch, use the extraReducers in the app slice
            dispatch(setCurrentProfile(loginData.session));

            // Check profile count for navigation
            const profileCount = await secureStorage.getProfileCount();
            // FixMe: do not use dispatch, use the extraReducers in the app slice
            if (profileCount > 1) {
              dispatch(navigateTo('profile-selection'));
            } else {
              dispatch(navigateTo('home/categories'));
            }

            return { data: loginData };
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
      { accessToken: string; refreshToken: string; success: true } | { success: false },
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

    refreshToken: builder.mutation<RefreshResponse | { valid: true }, void>({
      async queryFn(_, { dispatch, getState }) {
        try {
          // Refresh token using current session
          const sessionId = (getState() as RootState).app.auth.currentProfileId;
          if (!sessionId) {
            throw new Error('No session available for refresh');
          }
          const res = await client.api.auth.refresh[':session'].$post({
            param: { session: sessionId },
            query: {},
          });

          if (res.status === 200) {
            const refreshData = await res.json();

            // Check if it's a normal refresh response (not dry-run)
            if ('accessToken' in refreshData) {
              // Update stored access token
              const currentSessionId = sessionId;
              storeTokenData(refreshData.accessToken, refreshData.user, currentSessionId);

              return { data: refreshData };
            } else {
              // Dry-run response
              return { data: refreshData };
            }
          }

          // If refresh fails, clear tokens and redirect to login
          clearTokenData();
          // FixMe: do not use dispatch, use the extraReducers in the app slice
          dispatch(navigateTo('login'));

          const data = await res.json();
          return {
            error: {
              status: res.status,
              data: 'error' in data ? data.error : 'Token refresh failed',
            },
          };
        } catch (error: any) {
          // Clear tokens on error
          clearTokenData();
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
          // Call backend logout using session (profileId is the session)
          try {
            await client.api.auth.logout[':session'].$post({
              param: { session: profileId },
            });
          } catch (error) {
            // Continue with local cleanup even if backend call fails
            console.warn('Backend logout failed:', error);
          }

          // Clear stored token for this session
          clearTokenData(profileId);

          // Remove profile from storage
          await secureStorage.removeProfile(profileId);

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

  // Get current access token from storage
  getCurrentAccessToken(sessionId?: string): string | null {
    return getAccessToken(sessionId);
  },

  // Get current user from storage
  getCurrentUser(sessionId?: string): { id: string; email: string; role: string } | null {
    return getCurrentUser(sessionId);
  },

  // Get token data for a specific session
  getTokenDataBySession(sessionId: string) {
    return getTokenDataBySession(sessionId);
  },

  // Get all stored sessions
  getAllStoredSessions(): string[] {
    return getAllStoredSessions();
  },

  // Check if user is currently authenticated
  isAuthenticated(sessionId?: string): boolean {
    if (sessionId) {
      return getAccessToken(sessionId) !== null;
    }
    // Check if any session is authenticated
    const sessions = getAllStoredSessions();
    return sessions.some(session => getAccessToken(session) !== null);
  },

  async getCurrentProfile(profileId?: string): Promise<ProfileToken | null> {
    if (!profileId) return null;

    const profiles = await secureStorage.getProfiles();
    return profiles.find(p => p.profileId === profileId) || null;
  },

  async clearAllProfiles() {
    // Clear stored tokens
    clearTokenData();
    // Clear stored profiles
    await secureStorage.clearAll();
  },

  // Check if there is stored encrypted data
  hasStoredData(): boolean {
    return secureStorage.hasStoredData();
  },

  // Auto-refresh token mechanism
  async ensureValidToken(sessionId: string): Promise<boolean> {
    if (!getAccessToken(sessionId)) {
      // Try to refresh if we don't have an access token for this session
      try {
        const res = await client.api.auth.refresh[':session'].$post({
          param: { session: sessionId },
          query: {},
        });
        if (res.status === 200) {
          const refreshData = await res.json();
          // Check if it's a normal refresh response (not dry-run)
          if ('accessToken' in refreshData) {
            storeTokenData(refreshData.accessToken, refreshData.user, sessionId);
            return true;
          }
        }
      } catch (error) {
        // Refresh failed
      }
      return false;
    }
    return true;
  },

  // Clear tokens (for logout or errors)
  clearTokens(sessionId?: string) {
    clearTokenData(sessionId);
  },

  // Helper method to get active sessions with valid tokens
  getActiveSessions(): string[] {
    return getAllStoredSessions().filter(sessionId => {
      const tokenData = getTokenDataBySession(sessionId);
      return tokenData && tokenData.accessToken;
    });
  },
};
