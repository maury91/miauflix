import type { DeviceAuthResponse, LoginRequest, LoginResponse } from '@miauflix/backend-client';
import { hcWithType } from '@miauflix/backend-client';
import { createApi } from '@reduxjs/toolkit/query/react';
import { API_URL } from '@shared/config/constants';
import { accessTokenStorage, getStorageMode } from '@utils/accessTokenStorage';
import { secureStorage } from '@utils/storage';

import type { ProfileToken } from '@/types/auth';

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
if (process.env['NODE_ENV'] === 'development') {
  console.log(`\ud83d\udd12 Access token storage mode: ${getStorageMode()}`);
}

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
      async queryFn({ profileName, ...credentials }) {
        try {
          const res = await client.api.auth.login.$post({ json: credentials });
          if (res.status === 200) {
            const loginData: LoginResponse = await res.json();

            // Store access token, user, and session
            storeTokenData(loginData.accessToken, loginData.user, loginData.session);

            // Create profile entry (for user management, not token storage)
            const profileToken: ProfileToken = {
              profileId: loginData.session,
              profileName: profileName || loginData.user.email,
              expiresAt: Date.now() + 24 * 60 * 60 * 1000,
            };

            // Store the profile metadata securely (no tokens)
            await secureStorage.addProfile(profileToken);

            return { data: loginData };
          }

          const data = await res.json();
          return {
            error: {
              status: res.status,
              data: 'error' in data ? data.error : 'Login failed',
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
            return {
              error: { status: 400, data: data.error },
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
      { accessToken: string; refreshToken: string; success: true } | { success: false },
      { deviceCode: string }
    >({
      async queryFn({ deviceCode }) {
        try {
          const res = await client.api.trakt.auth.device.check.$post({ json: { deviceCode } });
          const data = await res.json();

          if ('error' in data) {
            return {
              error: { status: res.status, data: data.error },
            };
          }

          if ('accessToken' in data && 'refreshToken' in data) {
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

export const { useLoginMutation, useDeviceLoginMutation, useCheckDeviceLoginStatusMutation } =
  authApi;

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
    const sessions = getAllStoredSessions();
    return sessions.some(session => getAccessToken(session) !== null);
  },

  async getCurrentProfile(profileId?: string): Promise<ProfileToken | null> {
    if (!profileId) return null;

    const profiles = await secureStorage.getProfiles();
    return profiles.find(p => p.profileId === profileId) || null;
  },

  async clearAllProfiles() {
    clearTokenData();
    await secureStorage.clearAll();
  },

  hasStoredData(): boolean {
    return secureStorage.hasStoredData();
  },

  async ensureValidToken(sessionId: string): Promise<boolean> {
    if (!getAccessToken(sessionId)) {
      try {
        const res = await client.api.auth.refresh[':session'].$post({
          param: { session: sessionId },
          query: {},
        });
        if (res.status === 200) {
          const refreshData = await res.json();
          if ('accessToken' in refreshData) {
            storeTokenData(refreshData.accessToken, refreshData.user, sessionId);
            return true;
          }
        }
      } catch {
        // Refresh failed
      }
      return false;
    }
    return true;
  },

  clearTokens(sessionId?: string) {
    clearTokenData(sessionId);
  },

  getActiveSessions(): string[] {
    return getAllStoredSessions().filter(sessionId => {
      const tokenData = getTokenDataBySession(sessionId);
      return tokenData && tokenData.accessToken;
    });
  },
};
