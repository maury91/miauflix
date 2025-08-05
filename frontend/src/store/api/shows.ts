import type { SeasonResponse, ShowResponse } from '@miauflix/backend-client';
import { hcWithType } from '@miauflix/backend-client';
import { createApi } from '@reduxjs/toolkit/query/react';

import { API_URL } from '../../consts';

const client = hcWithType(API_URL);

export const showsApi = createApi({
  reducerPath: 'showsApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    getShow: builder.query<ShowResponse, { id: string }>({
      async queryFn({ id }) {
        try {
          const res = await client.shows[':id'].$get({
            param: { id },
          });
          if (res.status === 200) {
            const data = await res.json();
            return { data };
          }
          const data = await res.json();
          return {
            error: {
              status: res.status,
              data: 'error' in data ? data.error : 'Failed to fetch show',
            },
          };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
    }),
    getSeasons: builder.query<SeasonResponse[], { id: string }>({
      async queryFn({ id }) {
        try {
          const res = await client.shows[':id'].seasons.$get({
            param: { id },
          });
          if (res.status === 200) {
            const data = await res.json();
            return { data };
          }
          const data = await res.json();
          return {
            error: {
              status: res.status,
              data: 'error' in data ? data.error : 'Failed to fetch seasons',
            },
          };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
    }),
    getSeason: builder.query<SeasonResponse, { id: string; season: string }>({
      async queryFn({ id, season }) {
        try {
          // FixMe: the problem is on the backend side, the generated type is "{}"
          const res = await client.shows[':id'].seasons[':season'].$get({
            param: { id, season },
          });
          if (res.status === 200) {
            const data = await res.json();
            return { data };
          }
          const data = await res.json();
          return {
            error: {
              status: res.status,
              data: 'error' in data ? data.error : 'Failed to fetch season',
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

export const { useGetShowQuery, useGetSeasonsQuery, useGetSeasonQuery } = showsApi;
