import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

// ToDo: create lib project with common types
export interface Movie {
  watchers: number;
  title: string;
  year: number;
  ids: {
    trakt: number;
    slug: string;
    imdb: string;
    tmdb: number;
  };
  images: {
    poster: string;
    backdrop: string;
    backdrops: string[];
    logos: string[];
  };
}

// ToDo: Rename into lists
export const listsApi = createApi({
  reducerPath: 'listsApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/lists/` }),
  endpoints: (builder) => ({
    getList: builder.query<Movie[], string>({
      query: (category) => category,
    }),
  }),
});

export const { useGetListQuery, usePrefetch } = listsApi;
