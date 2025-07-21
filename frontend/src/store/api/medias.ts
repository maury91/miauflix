import { createApi } from '@reduxjs/toolkit/query/react';
import { hcWithType } from '@miauflix/backend-client';
import { API_URL } from '@/consts';

import type {
  MovieResponse,
  Quality,
  ShowResponse,
  StreamingKeyResponse,
} from '@miauflix/backend-client';

const client = hcWithType(API_URL);

// Type guards to check if response is the expected type
function isMovieResponse(data: any): data is MovieResponse {
  return data && typeof data === 'object' && data.type === 'movie' && typeof data.id === 'number';
}

function isShowResponse(data: any): data is ShowResponse {
  return data && typeof data === 'object' && data.type === 'show' && typeof data.id === 'number';
}

function isStreamingKeyResponse(data: any): data is StreamingKeyResponse {
  return data && typeof data === 'object' && typeof data.streamingKey === 'string';
}

export const mediasApi = createApi({
  reducerPath: 'mediasApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  tagTypes: ['Media'],
  endpoints: builder => ({
    getMovie: builder.query<MovieResponse, { id: number; includeSources?: boolean }>({
      async queryFn({ id, includeSources }) {
        try {
          const res = await client.movies[':id'].$get({
            param: { id: id.toString() },
            query: { lang: 'en', includeSources: includeSources ? 'true' : 'false' },
          });
          const data = await res.json();

          // Handle error responses
          if ('error' in data) {
            return {
              error: { status: 400, data: data.error },
            };
          }

          // Use type guard to ensure we have the correct type
          if (!isMovieResponse(data)) {
            return {
              error: { status: 500, data: 'Invalid movie response format' },
            };
          }

          return { data };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
      providesTags: (result, error, { id }) => [{ type: 'Media', id }],
    }),

    getShow: builder.query<ShowResponse, { id: number }>({
      async queryFn({ id }) {
        try {
          const res = await client.shows[':id'].$get({
            param: { id: id.toString() },
          });
          const data = await res.json();

          // Handle error responses
          if ('error' in data) {
            return {
              error: { status: 400, data: data.error },
            };
          }

          // Use type guard to ensure we have the correct type
          if (!isShowResponse(data)) {
            return {
              error: { status: 500, data: 'Invalid show response format' },
            };
          }

          return { data };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
      providesTags: (result, error, { id }) => [{ type: 'Media', id }],
    }),

    getShowSeasons: builder.query<unknown[], { id: number }>({
      async queryFn({ id }) {
        try {
          const res = await client.shows[':id'].seasons.$get({
            param: { id: id.toString() },
          });
          const data = await res.json();
          return { data: data as unknown[] };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
      providesTags: (result, error, { id }) => [{ type: 'Media', id }],
    }),

    getShowSeason: builder.query<unknown, { id: number; season: number }>({
      async queryFn({ id, season }) {
        try {
          const res = await client.shows[':id'].seasons[':season'].$get({
            param: { id: id.toString(), season: season.toString() },
          });
          const data = await res.json();
          return { data: data as unknown };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
      providesTags: (result, error, { id }) => [{ type: 'Media', id }],
    }),

    generateStreamingKey: builder.mutation<StreamingKeyResponse, { id: number; quality: string }>({
      async queryFn({ id, quality }) {
        try {
          const res = await client.movies[':id'][':quality'].$post({
            param: { id: id.toString(), quality: quality as any },
          });
          const data = await res.json();

          // Handle error responses
          if ('error' in data) {
            return {
              error: { status: 400, data: data.error },
            };
          }

          // Use type guard to ensure we have the correct type
          if (!isStreamingKeyResponse(data)) {
            return {
              error: { status: 500, data: 'Invalid streaming key response format' },
            };
          }

          return { data };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
      invalidatesTags: (result, error, { id }) => [{ type: 'Media', id }],
    }),

    // Stop stream (placeholder - no backend endpoint exists)
    stopStream: builder.mutation<void, { streamingKey: string }>({
      async queryFn({ streamingKey }) {
        try {
          // TODO: Implement stop stream endpoint
          console.log('Stop stream requested for:', streamingKey);
          return { data: undefined };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
    }),

    // Report broken stream
    reportBrokenStream: builder.mutation<void, { streamingKey: string; reason: string }>({
      async queryFn({ streamingKey, reason }) {
        try {
          // TODO: Implement broken stream reporting endpoint
          console.log('Broken stream reported:', { streamingKey, reason });
          return { data: undefined };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
    }),
  }),
});

export const getStreamUrl = (
  streamingKey: string,
  quality: Quality | 'auto',
  hvecSupport: boolean
) => {
  return client.stream[':token']
    .$url({
      param: { token: streamingKey },
      query: { quality, hevc: hvecSupport ? 'true' : 'false' },
    })
    .toString();
};

export const {
  useGetMovieQuery,
  useGetShowQuery,
  useGetShowSeasonsQuery,
  useGetShowSeasonQuery,
  useGenerateStreamingKeyMutation,
  useStopStreamMutation,
  useReportBrokenStreamMutation,
} = mediasApi;
