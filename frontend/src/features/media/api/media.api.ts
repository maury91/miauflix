import { authApi } from '@features/auth/api/auth.api';
import type { MovieResponse, SeasonResponse, ShowResponse } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

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
          ...(await sessionRequest<MovieResponse>(
            headers =>
              backendClient.api.movies[':id'].$get(
                { param: { id: String(mediaId) }, query: { lang: 'en' } },
                { headers }
              ),
            api.getState,
            api.dispatch,
            'Failed to fetch movie details'
          )),
        };
      },
    }),
    getShow: builder.query<ShowResponse, number>({
      async queryFn(mediaId, api) {
        return {
          ...(await sessionRequest<ShowResponse>(
            headers =>
              backendClient.api.shows[':id'].$get(
                { param: { id: String(mediaId) }, query: { lang: 'en' } },
                { headers }
              ),
            api.getState,
            api.dispatch,
            'Failed to fetch show details'
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
  }),
});

export const { useGetMovieQuery, useGetShowQuery, useGetSeasonQuery } = mediaApi;
