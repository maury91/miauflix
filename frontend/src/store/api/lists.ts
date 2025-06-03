import { MediaDto, Paginated } from '../../types/api';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

// ToDo: Rename into lists
export const listsApi = createApi({
  reducerPath: 'listsApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/lists/` }),
  endpoints: builder => ({
    getList: builder.query<Paginated<MediaDto>, { category: string; page: number }>({
      query: ({ category, page }) => `${category}?page=${page}`,
    }),
  }),
});

export const { useGetListQuery, usePrefetch } = listsApi;
