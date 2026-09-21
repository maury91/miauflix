import type {
  LoginRequest,
  LoginResponse,
  QrLoginClaimPending,
  QrLoginResponse,
  RefreshResponse,
} from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { refreshSession, request } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import type { SessionInfo } from '@store/slices/auth';

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
          () => backendClient.api.auth.login.$post({ json: credentials }),
          'Login failed'
        );
      },
    }),

    refresh: builder.mutation<RefreshResponse, { session: string }>({
      async queryFn({ session }) {
        return handleAuthRequest<RefreshResponse>(
          () => backendClient.api.auth.refresh[':session'].$post({ param: { session } }),
          'Refresh failed'
        );
      },
    }),

    logout: builder.mutation<{ message: string }, { session: string }>({
      async queryFn({ session }) {
        return handleAuthRequest<{ message: string }>(
          () => backendClient.api.auth.logout[':session'].$post({ param: { session } }),
          'Logout failed'
        );
      },
    }),

    listSessions: builder.query<SessionInfo[], void>({
      async queryFn() {
        const sessionsResult = await handleAuthRequest<SessionInfo[]>(
          () => backendClient.api.auth.sessions.$get(),
          'List sessions failed'
        );
        if (!('data' in sessionsResult) || sessionsResult.data.length !== 1) {
          return sessionsResult;
        }

        const [session] = sessionsResult.data;
        const headers = { 'X-Session-Id': session.session };
        const validation = await request(
          () => backendClient.api.auth.session.$get({}, { headers }),
          'Session validation failed'
        );

        if (!('error' in validation) || validation.error.status !== 401) {
          return 'error' in validation ? validation : sessionsResult;
        }

        const refresh = await refreshSession(session.session);
        if ('error' in refresh) {
          // An invalid refresh cookie is no longer a usable session. Transient
          // errors remain visible so bootstrap can be retried without logging out.
          return refresh.error.status === 401 ? { data: [] } : refresh;
        }

        return sessionsResult;
      },
    }),

    createQrLogin: builder.mutation<QrLoginResponse, void>({
      async queryFn() {
        return handleAuthRequest<QrLoginResponse>(
          () => backendClient.api.auth.qr.$post(),
          'QR login failed'
        );
      },
    }),

    claimQrLogin: builder.mutation<
      LoginResponse | QrLoginClaimPending,
      { requestId: string; claimToken: string }
    >({
      async queryFn({ requestId, claimToken }) {
        return handleAuthRequest<LoginResponse | QrLoginClaimPending>(
          () =>
            backendClient.api.auth.qr[':requestId'].claim.$post({
              param: { requestId },
              json: { claimToken },
            }),
          'QR login check failed'
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
  useCreateQrLoginMutation,
  useClaimQrLoginMutation,
} = authApi;
