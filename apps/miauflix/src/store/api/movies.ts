import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

interface Movie {
  watchers: number;
  movie: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      imdb: string;
      tmdb: number;
    };
  };
  fanart: {
    poster: string;
    backdrop: string;
    logo: string;
  };
}

export const moviesApi = createApi({
  reducerPath: 'moviesApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/movies/` }),
  endpoints: (builder) => ({
    getTrendingMovies: builder.query<Movie[], void>({
      query: () => 'trending',
    }),
  }),
});

console.log(moviesApi);

export const { useGetTrendingMoviesQuery } = moviesApi;
