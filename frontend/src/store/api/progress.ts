import { MovieProgressDto, ShowProgressDto, TrackPlaybackRequest } from '../../types/api';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

export const progressApi = createApi({
  reducerPath: 'progressApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/progress` }),
  endpoints: builder => ({
    getProgress: builder.query<(MovieProgressDto | ShowProgressDto)[], number>({
      query: userId => ({
        url: '',
        headers: {
          'x-user-id': `${userId}`,
        },
      }),
    }),
    trackMediaProgress: builder.mutation<
      void,
      TrackPlaybackRequest & { id: number; userId: number }
    >({
      query: body => ({
        url: `${body.id}`,
        method: 'POST',
        headers: {
          'x-user-id': `${body.userId}`,
        },
        body: {
          status: body.status,
          progress: body.progress,
          type: body.type,
        },
      }),
    }),
  }),
});

export const { useGetProgressQuery, useTrackMediaProgressMutation } = progressApi;
