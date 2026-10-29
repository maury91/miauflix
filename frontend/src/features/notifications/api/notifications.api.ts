import { authApi } from '@features/auth/api/auth.api';
import type { PlayableRef } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

export interface NotificationItem {
  id: number;
  type: 'movie_quality_upgrade' | 'source_available' | 'tv_episode_available';
  mediaType: 'movie' | 'tv';
  mediaId: number;
  title: string;
  message: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationList {
  notifications: NotificationItem[];
  unreadCount: number;
}

export const notificationsApi = createApi({
  reducerPath: 'notificationsApi',
  tagTypes: ['Notifications'],
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    getNotifications: builder.query<NotificationList, void>({
      async queryFn(_arg, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<NotificationList>({
          requestFn: () => backendClient.api.notifications.$get({}, { headers }),
          session: sessionId,
          errorContext: 'Failed to fetch notifications',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
      providesTags: ['Notifications'],
    }),
    markNotificationRead: builder.mutation<{ read: boolean }, number>({
      async queryFn(id, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<{ read: boolean }>({
          requestFn: () =>
            backendClient.api.notifications[':id'].read.$post(
              { param: { id: String(id) } },
              { headers }
            ),
          session: sessionId,
          errorContext: 'Failed to mark notification as read',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
      invalidatesTags: ['Notifications'],
    }),
    /** "Notify me": be told once the playable gets a real source. */
    requestAvailability: builder.mutation<{ requested: boolean }, PlayableRef>({
      async queryFn(playable, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<{ requested: boolean }>({
          requestFn: () =>
            backendClient.api.notifications.availability.$post({ json: { playable } }, { headers }),
          session: sessionId,
          errorContext: 'Failed to request an availability notification',
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
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useRequestAvailabilityMutation,
} = notificationsApi;
