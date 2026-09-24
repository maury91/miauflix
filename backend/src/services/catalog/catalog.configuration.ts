import { serviceConfiguration, transforms, variable } from '@utils/config';

/**
 * Backend-side CATALOG variables — only the knobs the backend itself needs to
 * reach the media-catalog service and the backend-owned schedule cadences.
 */
export const catalogConfigurationDefinition = serviceConfiguration({
  name: 'Media Catalog',
  description:
    'The media catalog service provides Miauflix with its movie and TV catalogue, including seasons, episodes, and posters.',
  variables: {
    CATALOG_SERVICE_URL: variable({
      label: 'Catalog Service URL',
      description: 'URL of the media catalog service (internal)',
      example: 'http://localhost:3001',
      defaultValue: 'http://localhost:3001',
      required: true,
      advanced: true,
      testRelevant: true,
      testFailureHelp:
        'The media catalog service may be down, or the URL may be incorrect. It is usually reachable on the internal docker network.',
      transform: transforms.url(),
    }),
    CATALOG_SERVICE_TIMEOUT_MS: variable({
      description: 'Timeout in milliseconds for media catalog requests',
      example: '120000',
      defaultValue: '120000',
      required: false,
      advanced: true,
      transform: transforms.number({ min: 1000, integer: true }),
    }),
    CATALOG_MOVIE_SYNC_INTERVAL: variable({
      description: 'Interval in seconds between catalog movie change scans',
      defaultValue: '5400',
      required: false,
      advanced: true,
      transform: transforms.number({ min: 1 }),
    }),
    CATALOG_SHOW_SYNC_INTERVAL: variable({
      description: 'Interval in seconds between catalog TV show change scans',
      defaultValue: '5400',
      required: false,
      advanced: true,
      transform: transforms.number({ min: 1 }),
    }),
    CATALOG_SEASON_SYNC_INTERVAL: variable({
      description: 'Interval in seconds between incomplete season sync seeds',
      defaultValue: '5',
      required: false,
      advanced: true,
      transform: transforms.number({ min: 0.1 }),
    }),
  },
});
