import { authApi } from '@features/auth/api/auth.api';
import type {
  CreatePlaybackSessionResponse,
  PlayableRef,
  Quality,
  SubtitleSearchResponse,
} from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

export interface PlaybackPreferences {
  quality: Quality | 'auto';
  allowHevc: boolean;
}

export interface CreatePlaybackSessionRequest {
  playable: PlayableRef;
  preferences: PlaybackPreferences;
}

export const playbackApi = createApi({
  reducerPath: 'playbackApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    searchSubtitles: builder.mutation<
      SubtitleSearchResponse,
      { streamingKey: string; language: string; hearingImpaired: boolean; refresh?: boolean }
    >({
      async queryFn(input, api) {
        const session = selectCurrentSessionId(api.getState() as RootState);
        const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
        return authenticatedRequest<SubtitleSearchResponse>({
          requestFn: () =>
            backendClient.api.subtitles.search.$post(
              { json: { ...input, refresh: input.refresh ?? false } },
              { headers }
            ),
          session,
          errorContext: 'Failed to search subtitles',
          onInvalidSession: () => {
            api.dispatch({ type: 'auth/clearAuth' });
            api.dispatch(
              authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true })
            );
          },
        });
      },
    }),
    createSession: builder.mutation<CreatePlaybackSessionResponse, CreatePlaybackSessionRequest>({
      async queryFn({ playable, preferences }, api) {
        const session = selectCurrentSessionId(api.getState() as RootState);
        const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
        return authenticatedRequest<CreatePlaybackSessionResponse>({
          requestFn: () =>
            backendClient.api.playback.sessions.$post(
              { json: { playable, preferences } },
              { headers }
            ),
          session,
          errorContext: 'Failed to start playback',
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

export const { useCreateSessionMutation, useSearchSubtitlesMutation } = playbackApi;
