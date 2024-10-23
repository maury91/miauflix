import { CategoryDto } from '@miauflix/types';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

export const categoriesApi = createApi({
  reducerPath: 'categoriesApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/categories/` }),
  endpoints: (builder) => ({
    getCategories: builder.query<CategoryDto[], void>({
      query: () => '',
    }),
  }),
});

console.log(categoriesApi);

export const { useGetCategoriesQuery, usePrefetch } = categoriesApi;
