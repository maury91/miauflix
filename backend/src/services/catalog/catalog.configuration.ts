import { serviceConfiguration, transforms, variable } from '@utils/config';

/**
 * Backend-side CATALOG variables — only the knobs the backend itself needs to
 * reach the media-catalog service. Everything the *catalog service* needs
 * (provider token, sync cadence...) is declared by the service itself and
 * dynamically merged into this group by the generic remote-service manager.
 */
export const catalogConfigurationDefinition = serviceConfiguration({
  name: 'Media Catalog',
  description:
    'The media catalog service provides Miauflix with its movie and TV catalogue, including seasons, episodes, and posters.',
  variables: {
    CATALOG_SERVICE_URL: variable({
      description: 'URL of the media catalog service (internal)',
      example: 'http://localhost:3001',
      defaultValue: 'http://localhost:3001',
      required: true,
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
      transform: transforms.number({ min: 1000, integer: true }),
    }),
  },
});
