import { MovieDto } from '@miauflix/types';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

// ToDo: Rename into lists
export const listsApi = createApi({
  reducerPath: 'listsApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/lists/` }),
  endpoints: (builder) => ({
    getList: builder.query<MovieDto[], string>({
      query: (category) => category,
    }),
  }),
});

export const { useGetListQuery, usePrefetch } = listsApi;
