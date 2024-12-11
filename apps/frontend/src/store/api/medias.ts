import {
  ExtendedMediaDto,
  ExtendedMovieDto,
  ExtendedShowDto,
  GetStreamDto,
  SeasonDto,
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
    getShowSeason: builder.query<SeasonDto, { showId: string; season: number }>(
      {
        query: ({ showId, season }) => `shows/${showId}/seasons/${season}`,
      }
    ),
    getShowSeasons: builder.query<SeasonDto[], string>({
      query: (showId) => `shows/${showId}/seasons`,
    }),
    getStreamUrl: builder.query<
      GetStreamDto,
      { type: 'movie' | 'episode'; id: string | number; supportsHvec: boolean }
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
  useGetShowSeasonQuery,
  useGetShowSeasonsQuery,
  useStopStreamMutation,
} = mediasApi;
