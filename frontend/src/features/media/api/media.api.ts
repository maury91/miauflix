import { authApi } from '@features/auth/api/auth.api';
import type {
  BackdropFocusBackgroundResponse,
  BackdropFocusResponse,
  MovieResponse,
  SeasonResponse,
  ShowResponse,
} from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

// The backend protects each media-detail route at five requests per second. Continue Watching
// can hydrate several shows at once, so keep requests for the same route below that ceiling while
// still allowing RTK Query to deduplicate identical media IDs.
const MEDIA_DETAIL_INTERVAL_MS = 225;
let nextMovieRequestAt = 0;
let nextShowRequestAt = 0;

async function scheduleMediaDetailRequest<T>(
  kind: 'movie' | 'show',
  request: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const nextRequestAt = kind === 'movie' ? nextMovieRequestAt : nextShowRequestAt;
  const startAt = Math.max(now, nextRequestAt);
  if (kind === 'movie') {
    nextMovieRequestAt = startAt + MEDIA_DETAIL_INTERVAL_MS;
  } else {
    nextShowRequestAt = startAt + MEDIA_DETAIL_INTERVAL_MS;
  }
  if (startAt > now) {
    await new Promise<void>(resolve => setTimeout(resolve, startAt - now));
  }
  return request();
}

const sessionRequest = <T>(
  requestFn: (headers: Record<string, string>) => Promise<Response>,
  getState: () => unknown,
  dispatch: (action: unknown) => unknown,
  errorContext: string
) => {
  const session = selectCurrentSessionId(getState() as RootState);
  const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
  return authenticatedRequest<T>({
    requestFn: () => requestFn(headers),
    session,
    errorContext,
    onInvalidSession: () => {
      dispatch({ type: 'auth/clearAuth' });
      dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
    },
  });
};

export const mediaApi = createApi({
  reducerPath: 'mediaApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    getMovie: builder.query<MovieResponse, number>({
      async queryFn(mediaId, api) {
        return {
          ...(await scheduleMediaDetailRequest('movie', () =>
            sessionRequest<MovieResponse>(
              headers =>
                backendClient.api.movies[':id'].$get(
                  { param: { id: String(mediaId) }, query: { lang: 'en' } },
                  { headers }
                ),
              api.getState,
              api.dispatch,
              'Failed to fetch movie details'
            )
          )),
        };
      },
    }),
    getShow: builder.query<ShowResponse, number>({
      async queryFn(mediaId, api) {
        return {
          ...(await scheduleMediaDetailRequest('show', () =>
            sessionRequest<ShowResponse>(
              headers =>
                backendClient.api.shows[':id'].$get(
                  { param: { id: String(mediaId) }, query: { lang: 'en' } },
                  { headers }
                ),
              api.getState,
              api.dispatch,
              'Failed to fetch show details'
            )
          )),
        };
      },
    }),
    getSeason: builder.query<SeasonResponse, { showId: number; season: number }>({
      async queryFn({ showId, season }, api) {
        return {
          ...(await sessionRequest<SeasonResponse>(
            headers =>
              backendClient.api.shows[':id'].seasons[':season'].$get(
                {
                  param: { id: String(showId), season: String(season) },
                },
                { headers }
              ),
            api.getState,
            api.dispatch,
            'Failed to fetch season details'
          )),
        };
      },
    }),
    ensureBackdropFocus: builder.mutation<
      BackdropFocusResponse,
      { mediaType: 'movie' | 'tv'; mediaId: number }
    >({
      /** Requests backdrop focus for a catalog media ID, returning request failures as RTK Query errors. */
      async queryFn({ mediaType, mediaId }, api) {
        return {
          ...(await sessionRequest<BackdropFocusResponse>(
            headers =>
              backendClient.api.media[':mediaType'][':mediaId']['backdrop-focus'].$post(
                { param: { mediaType, mediaId: String(mediaId) } },
                { headers }
              ),
            api.getState,
            api.dispatch,
            'Failed to analyze backdrop focus'
          )),
        };
      },
    }),
    queueBackdropFocus: builder.mutation<
      BackdropFocusBackgroundResponse,
      { items: Array<{ mediaType: 'movie' | 'tv'; mediaId: number }> }
    >({
      /** Enqueues displayed-list backdrop work without waiting for model analysis. */
      async queryFn({ items }, api) {
        return {
          ...(await sessionRequest<BackdropFocusBackgroundResponse>(
            headers =>
              backendClient.api.media['backdrop-focus'].background.$post(
                { json: { items } },
                { headers }
              ),
            api.getState,
            api.dispatch,
            'Failed to queue backdrop focus preparation'
          )),
        };
      },
    }),
  }),
});

export const {
  useGetMovieQuery,
  useGetShowQuery,
  useGetSeasonQuery,
  useLazyGetSeasonQuery,
  useEnsureBackdropFocusMutation,
  useQueueBackdropFocusMutation,
} = mediaApi;
