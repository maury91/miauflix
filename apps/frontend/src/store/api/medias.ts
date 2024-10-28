import {
  ExtendedMovieDto,
  GetStreamDto,
  VideoQuality,
  VideoQualityStr,
} from '@miauflix/types';
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
      { type: 'movie'; id: string; quality: VideoQuality | VideoQualityStr }
    >({
      query: ({ type, id, quality }) => `stream/${type}/${id}/${quality}`,
    }),
    stopStream: builder.mutation<
      void,
      { type: 'movie'; id: string; quality: VideoQuality | VideoQualityStr }
    >({
      query: ({ type, id, quality }) => ({
        url: `stream/${type}/${id}/${quality}`,
        method: 'DELETE',
      }),
    }),
  }),
});

export const { useGetExtendedInfoQuery, useGetStreamUrlQuery, usePrefetch } =
  mediasApi;
