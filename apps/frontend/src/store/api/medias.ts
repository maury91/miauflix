import {
  ExtendedMediaDto,
  ExtendedMovieDto,
  ExtendedShowDto,
  GetStreamDto,
} from '@miauflix/types';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

export const mediasApi = createApi({
  reducerPath: 'mediasApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/` }),
  endpoints: (builder) => ({
    getExtendedInfo: builder.query<
      ExtendedMediaDto,
      { type: 'movie' | 'show'; id: string }
    >({
      query: ({ type, id }) => `${type}s/${id}`,
    }),
    getExtendedMovie: builder.query<ExtendedMovieDto, string>({
      query: (id) => `movies/${id}`,
    }),
    getExtendedShow: builder.query<ExtendedShowDto, string>({
      query: (id) => `shows/${id}`,
    }),
    getStreamUrl: builder.query<
      GetStreamDto,
      { type: 'movie'; id: string; supportsHvec: boolean }
    >({
      query: ({ type, id, supportsHvec }) =>
        `stream/${type}/${id}/${supportsHvec ? 'true' : 'false'}`,
    }),
    stopStream: builder.mutation<void, string>({
      query: (streamId) => ({
        url: `stream/${streamId}`,
        method: 'DELETE',
      }),
    }),
  }),
});

export const {
  useGetExtendedInfoQuery,
  useGetExtendedMovieQuery,
  useGetExtendedShowQuery,
  useGetStreamUrlQuery,
  useStopStreamMutation,
} = mediasApi;
