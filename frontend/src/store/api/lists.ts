import type { ListResponse, ListsResponse } from '@miauflix/backend-client';
import { hcWithType } from '@miauflix/backend-client';
import { createApi } from '@reduxjs/toolkit/query/react';

import { API_URL } from '@/consts';

const client = hcWithType(API_URL);

export const listsApi = createApi({
  reducerPath: 'listsApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    getLists: builder.query<ListsResponse, void>({
      async queryFn() {
        try {
          const res = await client.api.lists.$get({});
          if (res.status === 200) {
            const data = await res.json();
            return { data };
          }
          const data = await res.json();
          return {
            error: {
              status: res.status,
              data: 'error' in data ? data.error : 'Failed to fetch lists',
            },
          };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
    }),
    // Returns a paginated list of medias
    getList: builder.query<ListResponse, { category: string; page: number }>({
      async queryFn({ category, page }) {
        try {
          const res = await client.api.list[':slug'].$get({
            param: { slug: category },
            query: { lang: 'en' },
          });
          if (res.status === 200) {
            const data = await res.json();
            return { data };
          }
          return {
            error: { status: res.status, data: 'Failed to fetch list' },
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

export const { useGetListQuery, useGetListsQuery, usePrefetch } = listsApi;
