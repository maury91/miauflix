import { serviceConfiguration } from '@mytypes/configuration';

import { TMDBApi } from './tmdb.api';

// Use the helper function instead of explicit type annotation

export const tmdbConfigurationDefinition = serviceConfiguration({
  name: 'The Movie Database (TMDB)',
  description: 'Service for fetching movie and TV show information',
  variables: {
    TMDB_API_URL: {
      description: 'URL for The Movie Database API',
      example: 'https://api.themoviedb.org/3',
      defaultValue: 'https://api.themoviedb.org/3',
      required: false,
    },
    TMDB_API_ACCESS_TOKEN: {
      description: 'Access token for The Movie Database API',
      example: 'eyJhbGciOiJIUzI1NiJ9...',
      link: 'https://www.themoviedb.org/settings/api',
      required: true,
      password: true,
    },
  },
  test: async () => {
    try {
      const tmdbApi = new TMDBApi();

      // Use test because it doesn't use cache
      await tmdbApi.test();
    } catch (error: unknown) {
      console.error(error);
      if (error) {
        if (typeof error === 'object' && error && 'status' in error) {
          if (error.status === 401) {
            throw new Error(`Invalid Access Token`);
          }
          throw new Error(`Connection error: ${error.status}`);
        }
        throw error;
      }
    }
  },
});
