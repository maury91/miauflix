import type { CatalogConfigSchema } from '../types';

/**
 * Declarative configuration schema of the service.
 *
 * Field names deliberately mirror the main app's config DSL output (`ConfigEntryView`)
 * so `GET /configuration/schema` can be mapped 1:1 onto dynamic `variable()` entries:
 * the existing CLI wizard and admin UI render and validate them without knowing this
 * service exists. Adding a variable here is all it takes to surface it there.
 */
export const CATALOG_CONFIG_SCHEMA: CatalogConfigSchema = {
  groups: [
    {
      id: 'TMDB',
      name: 'TMDB',
      description: 'Shared The Movie Database API settings.',
      variables: [
        {
          key: 'TMDB_API_URL',
          inputType: 'text',
          required: false,
          defaultValue: 'https://api.themoviedb.org/3',
          example: 'https://api.themoviedb.org/3',
          testRelevant: true,
          description: 'URL of The Movie Database API',
          testFailureHelp:
            'The URL may be incorrect, or the catalog may be temporarily unreachable.',
        },
        {
          key: 'TMDB_API_ACCESS_TOKEN',
          inputType: 'password',
          required: true,
          secret: true,
          testRelevant: true,
          description:
            'In the catalog provider API settings, generate a new API Read Access Token and paste it here.',
          link: 'https://www.themoviedb.org/settings/api',
          linkLabel: 'Open TMDB API settings',
          testFailureHelp:
            'The access token may be invalid, expired, or missing required permissions.',
        },
      ],
    },
    {
      id: 'CATALOG_RUNTIME',
      name: 'Media Catalog',
      description: 'Media catalog behavior and metadata freshness.',
      variables: [
        {
          key: 'EPISODE_SYNC_MODE',
          inputType: 'select',
          required: false,
          defaultValue: 'ON_DEMAND',
          options: {
            GREEDY: 'sync episodes of every tv show',
            ON_DEMAND: 'sync episodes only of tv shows marked as watching',
          },
          description: 'How episode lists are kept in sync',
        },
        {
          key: 'CATALOG_HYDRATION_TTL_MS',
          inputType: 'number',
          required: false,
          defaultValue: '86400000',
          numberOptions: { min: 60000, integer: true },
          description:
            'How long (in milliseconds) stored media details stay fresh before a refresh',
        },
      ],
    },
  ],
};
