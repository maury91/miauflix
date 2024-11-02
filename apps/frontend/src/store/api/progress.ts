import { ProgressDto, TrackMoviePlaybackRequest } from '@miauflix/types';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

export const progressApi = createApi({
  reducerPath: 'progressApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/progress` }),
  endpoints: (builder) => ({
    getProgress: builder.query<ProgressDto, void>({
      query: () => '',
    }),
    trackMovieProgress: builder.mutation<
      void,
      TrackMoviePlaybackRequest & { id: string; userId: number }
    >({
      query: (body) => ({
        url: `movies/${body.id}/watch`,
        method: 'POST',
        headers: {
          'x-user-id': body.userId.toString(),
        },
        body: {
          action: body.action,
        },
      }),
    }),
  }),
});

export const {
  useGetProgressQuery,
  useTrackMovieProgressMutation,
  usePrefetch,
} = progressApi;
