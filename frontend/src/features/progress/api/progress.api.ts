import { authApi } from '@features/auth/api/auth.api';
import type { PlayableRef, ProgressListResponse, ProgressRequest } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { AppDispatch, RootState } from '@store/store';

export const progressApi = createApi({
  reducerPath: 'progressApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  tagTypes: ['Progress'],
  endpoints: builder => ({
    getProgress: builder.query<ProgressListResponse, void>({
      providesTags: ['Progress'],
      async queryFn(_arg, api) {
        const session = selectCurrentSessionId(api.getState() as RootState);
        const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
        return authenticatedRequest<ProgressListResponse>({
          requestFn: () => backendClient.api.progress.$get({}, { headers }),
          session,
          errorContext: 'Failed to load playback progress',
          onInvalidSession: () => {
            api.dispatch({ type: 'auth/clearAuth' });
            api.dispatch(
              authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true })
            );
          },
        });
      },
    }),
    updateProgress: builder.mutation<void, ProgressRequest>({
      invalidatesTags: ['Progress'],
      async queryFn(progress, api) {
        const session = selectCurrentSessionId(api.getState() as RootState);
        const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
        return authenticatedRequest<void>({
          requestFn: () => backendClient.api.progress.$post({ json: progress }, { headers }),
          session,
          errorContext: 'Failed to save playback progress',
          onInvalidSession: () => {
            api.dispatch({ type: 'auth/clearAuth' });
            api.dispatch(
              authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true })
            );
          },
        });
      },
    }),
  }),
});

export const { useGetProgressQuery, useUpdateProgressMutation } = progressApi;

/** Reflect a successfully sent realtime update without refetching the whole progress list. */
export function applyProgressUpdate(dispatch: AppDispatch, update: ProgressRequest): void {
  dispatch(
    progressApi.util.updateQueryData('getProgress', undefined, draft => {
      const existing = draft.progress.find(entry => samePlayable(entry.playable, update.playable));
      const next = { ...update, updatedAt: new Date().toISOString() };
      if (existing) {
        Object.assign(existing, next);
        delete existing.nextEpisode;
      } else {
        draft.progress.push(next);
      }
    })
  );
}

function samePlayable(left: PlayableRef, right: PlayableRef): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'movie' && right.kind === 'movie') return left.mediaId === right.mediaId;
  if (left.kind === 'episode' && right.kind === 'episode') {
    return (
      left.showMediaId === right.showMediaId &&
      left.seasonNumber === right.seasonNumber &&
      left.episodeNumber === right.episodeNumber
    );
  }
  return false;
}

export function progressForPlayable(
  entries: ProgressListResponse['progress'],
  playable: PlayableRef
) {
  return entries.find(entry => {
    if (entry.playable.kind !== playable.kind) return false;
    if (playable.kind === 'movie' && entry.playable.kind === 'movie') {
      return entry.playable.mediaId === playable.mediaId;
    }
    return (
      entry.playable.kind === 'episode' &&
      playable.kind === 'episode' &&
      entry.playable.showMediaId === playable.showMediaId &&
      entry.playable.seasonNumber === playable.seasonNumber &&
      entry.playable.episodeNumber === playable.episodeNumber
    );
  });
}
