import { serviceConfiguration, transforms, variable } from '@utils/config';

export const tmdbConfigurationDefinition = serviceConfiguration({
  name: 'The Movie Database (TMDB)',
  description: 'Service for fetching movie and TV show information',
  variables: {
    TMDB_API_URL: variable({
      description: 'URL for The Movie Database API',
      example: 'https://api.themoviedb.org/3',
      defaultValue: 'https://api.themoviedb.org/3',
      required: false,
      transform: transforms.url(),
    }),
    TMDB_API_ACCESS_TOKEN: variable({
      description: 'Access token for The Movie Database API',
      example: 'eyJhbGciOiJIUzI1NiJ9...',
      link: 'https://www.themoviedb.org/settings/api',
      required: true,
      password: true,
    }),
    EPISODE_SYNC_MODE: variable({
      description: 'Episode metadata sync strategy',
      example: 'ON_DEMAND',
      defaultValue: 'ON_DEMAND',
      required: false,
      options: {
        GREEDY: 'sync every tv show',
        ON_DEMAND: 'sync only tv shows marked as watching',
      },
      transform: transforms.enum({
        values: ['GREEDY', 'ON_DEMAND'] as const,
      }),
    }),
  },
});
