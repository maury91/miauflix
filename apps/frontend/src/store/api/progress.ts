import {
  MovieProgressDto,
  ProgressDto,
  ShowProgressDto,
  TrackPlaybackRequest,
} from '@miauflix/types';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

export const progressApi = createApi({
  reducerPath: 'progressApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/progress` }),
  endpoints: (builder) => ({
    getMoviesProgress: builder.query<MovieProgressDto[], number>({
      query: (userId) => ({
        url: 'movies',
        headers: {
          'x-user-id': `${userId}`,
        },
      }),
    }),
    getEpisodesProgress: builder.query<ShowProgressDto[], number>({
      query: (userId) => ({
        url: 'episodes',
        headers: {
          'x-user-id': `${userId}`,
        },
      }),
    }),
    trackMovieProgress: builder.mutation<
      void,
      TrackPlaybackRequest & { id: string; userId: number }
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
          type: body.type,
        },
      }),
    }),
  }),
});

export const {
  useGetMoviesProgressQuery,
  useGetEpisodesProgressQuery,
  useTrackMovieProgressMutation,
} = progressApi;
