import { CategoryDto } from '../../types/api';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

export const categoriesApi = createApi({
  reducerPath: 'categoriesApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/categories/` }),
  endpoints: builder => ({
    getCategories: builder.query<CategoryDto[], void>({
      query: () => '',
    }),
  }),
});

export const { useGetCategoriesQuery, usePrefetch } = categoriesApi;
