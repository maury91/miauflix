import { authApi } from '@features/auth/api/auth.api';
import type { PlayableRef } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import type { SourceQuality, SourceReleaseType } from '@shared/ui/quality-badge/quality';
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
  /** The announced source's resolution and release type, when known. */
  quality: SourceQuality | null;
  sourceType: SourceReleaseType | null;
  /** Best release type before a quality upgrade. */
  previousSourceType: SourceReleaseType | null;
  poster: string | null;
  createdAt: string;
  readAt: string | null;
}

export type NotificationStatus = 'read' | 'unread';

export interface NotificationPage {
  notifications: NotificationItem[];
  nextCursor: number | null;
}

export interface NotificationCounts {
  unreadCount: number;
  hasRead: boolean;
}

const NOTIFICATIONS_PAGE_SIZE = 20;

export const notificationsApi = createApi({
  reducerPath: 'notificationsApi',
  tagTypes: ['Notifications'],
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    /** Unread and read notifications are separate streams, each paged newest first. */
    getNotifications: builder.infiniteQuery<
      NotificationPage,
      { status: NotificationStatus },
      number | null
    >({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
      },
      async queryFn({ queryArg, pageParam }, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<NotificationPage>({
          requestFn: () =>
            backendClient.api.notifications.$get(
              {
                query: {
                  status: queryArg.status,
                  limit: String(NOTIFICATIONS_PAGE_SIZE),
                  ...(pageParam ? { cursor: String(pageParam) } : {}),
                },
              },
              { headers }
            ),
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
    getNotificationCounts: builder.query<NotificationCounts, void>({
      async queryFn(_arg, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<NotificationCounts>({
          requestFn: () => backendClient.api.notifications['unread-count'].$get({}, { headers }),
          session: sessionId,
          errorContext: 'Failed to fetch notification counts',
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
    markAllNotificationsRead: builder.mutation<{ read: number }, void>({
      async queryFn(_arg, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<{ read: number }>({
          requestFn: () => backendClient.api.notifications['read-all'].$post({}, { headers }),
          session: sessionId,
          errorContext: 'Failed to mark notifications as read',
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
  useGetNotificationsInfiniteQuery,
  useGetNotificationCountsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useRequestAvailabilityMutation,
} = notificationsApi;
