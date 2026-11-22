import { authApi } from '@features/auth/api/auth.api';
import type {
  AudioSourcesResponse,
  CreatePlaybackSessionResponse,
  PlayableRef,
  SubtitleSearchResponse,
} from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { t } from '@shared/i18n';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

export type PlaybackPreferences =
  import('@miauflix/backend').CreatePlaybackSessionRequest['preferences'];

export interface CreatePlaybackSessionRequest {
  playable: PlayableRef;
  preferences: PlaybackPreferences;
  deferDownload?: boolean;
  /** Sources this browser failed to play, so the backend picks another one. */
  avoidSourceIds?: number[];
  /** The source the viewer chose (one in another language). */
  sourceId?: number;
}

/** The same session handling for every playback request. */
function request<T>(
  api: { getState: () => unknown; dispatch: (action: unknown) => unknown },
  errorContext: string,
  requestFn: (headers: Record<string, string>) => Promise<Response>
) {
  const session = selectCurrentSessionId(api.getState() as RootState);
  const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
  return authenticatedRequest<T>({
    requestFn: () => requestFn(headers),
    session,
    errorContext,
    onInvalidSession: () => {
      api.dispatch({ type: 'auth/clearAuth' });
      api.dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
    },
  });
}

export const playbackApi = createApi({
  reducerPath: 'playbackApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    /** The title's known sources, with the languages they play in. */
    getAudioSources: builder.query<AudioSourcesResponse, { playable: PlayableRef }>({
      async queryFn({ playable }, api) {
        return request<AudioSourcesResponse>(api, t('api.failedToLoadAudioSources'), headers =>
          backendClient.api.playback.sources.$post({ json: { playable } }, { headers })
        );
      },
    }),
    /** Look for the title's releases in a language; the sources found replace the list above. */
    searchAudioSources: builder.mutation<
      AudioSourcesResponse,
      { playable: PlayableRef; language: string }
    >({
      async queryFn(input, api) {
        return request<AudioSourcesResponse>(api, t('api.failedToSearchAudioSources'), headers =>
          backendClient.api.playback.sources.search.$post({ json: input }, { headers })
        );
      },
      async onQueryStarted({ playable }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(playbackApi.util.upsertQueryData('getAudioSources', { playable }, data));
        } catch {
          // The list keeps what it had; the panel says the search failed.
        }
      },
    }),
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
          errorContext: t('api.failedToSearchSubtitles'),
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
      async queryFn({ playable, preferences, deferDownload, avoidSourceIds, sourceId }, api) {
        const session = selectCurrentSessionId(api.getState() as RootState);
        const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
        return authenticatedRequest<CreatePlaybackSessionResponse>({
          requestFn: () =>
            backendClient.api.playback.sessions.$post(
              {
                json: {
                  playable,
                  preferences,
                  ...(deferDownload ? { deferDownload } : {}),
                  // Sources this browser failed to play, so the backend picks another one.
                  ...(avoidSourceIds?.length ? { avoidSourceIds } : {}),
                  ...(sourceId ? { sourceId } : {}),
                },
              },
              { headers }
            ),
          session,
          errorContext: t('api.failedToStartPlayback'),
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

export const {
  useCreateSessionMutation,
  useSearchSubtitlesMutation,
  useGetAudioSourcesQuery,
  useSearchAudioSourcesMutation,
} = playbackApi;
