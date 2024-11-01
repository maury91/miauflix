import { ExtendedMovieDto, GetStreamDto } from '@miauflix/types';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

export const mediasApi = createApi({
  reducerPath: 'mediasApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/` }),
  endpoints: (builder) => ({
    getExtendedInfo: builder.query<
      ExtendedMovieDto,
      { type: 'movie'; id: string }
    >({
      query: ({ type, id }) => `${type}s/${id}`,
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
  useGetStreamUrlQuery,
  useStopStreamMutation,
  usePrefetch,
} = mediasApi;
