import type { MovieResponse, Quality, StreamingKeyResponse } from '@miauflix/backend-client';
import { hcWithType } from '@miauflix/backend-client';
import { createApi } from '@reduxjs/toolkit/query/react';

import { API_URL } from '../../consts';

const client = hcWithType(API_URL);

export const moviesApi = createApi({
  reducerPath: 'moviesApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    getMovie: builder.query<MovieResponse, { id: string; lang?: string; includeSources?: boolean }>(
      {
        async queryFn({ id, lang, includeSources }) {
          try {
            const res = await client.movies[':id'].$get({
              param: { id },
              query: { lang, includeSources: includeSources?.toString() },
            });
            if (res.status === 200) {
              const data = await res.json();
              return { data };
            }
            const data = await res.json();
            return {
              error: {
                status: res.status,
                data: 'error' in data ? data.error : 'Failed to fetch movie',
              },
            };
          } catch (error: any) {
            return {
              error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
            };
          }
        },
      }
    ),
    getStreamingKey: builder.mutation<
      StreamingKeyResponse,
      { id: string; quality: Quality | 'auto' }
    >({
      async queryFn({ id, quality }) {
        try {
          const res = await client.movies[':id'][':quality'].$post({ param: { id, quality } });
          if (res.status === 200) {
            const data = await res.json();
            // Convert string date to Date object
            return {
              data: {
                ...data,
                expiresAt: new Date(data.expiresAt),
              },
            };
          }
          const data = await res.json();
          return {
            error: {
              status: res.status,
              data: 'error' in data ? data.error : 'Failed to fetch streaming key',
            },
          };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
    }),
  }),
});

export const { useGetMovieQuery, useGetStreamingKeyMutation } = moviesApi;
