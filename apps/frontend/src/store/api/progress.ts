import { ProgressDto, TrackMoviePlaybackRequest } from '@miauflix/types';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

export const progressApi = createApi({
  reducerPath: 'progressApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/progress` }),
  endpoints: (builder) => ({
    getProgress: builder.query<ProgressDto, number>({
      query: (userId) => ({
        url: '',
        headers: {
          'x-user-id': `${userId}`,
        },
      }),
    }),
    trackMovieProgress: builder.mutation<
      void,
      TrackMoviePlaybackRequest & { id: string; userId: number }
    >({
      query: (body) => ({
        url: body.id,
        method: 'POST',
        headers: {
          'x-user-id': body.userId.toString(),
        },
        body: {
          action: body.action,
          progress: body.progress,
        },
      }),
    }),
  }),
});

export const { useGetProgressQuery, useTrackMovieProgressMutation } =
  progressApi;
