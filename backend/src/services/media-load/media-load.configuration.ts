import { serviceConfiguration, transforms, variable } from '@utils/config';

export const mediaLoadConfigurationDefinition = serviceConfiguration({
  name: 'Media load',
  description: 'Torrent engine: downloads, encrypted storage and tracker scrapes.',
  variables: {
    MEDIA_LOAD_SERVICE_URL: variable({
      description: 'URL of the internal media-load (torrent engine) service',
      defaultValue: 'http://localhost:3004',
      required: true,
      advanced: true,
      testRelevant: true,
      transform: transforms.url(),
    }),
    MEDIA_LOAD_SERVICE_TIMEOUT_MS: variable({
      description: 'Timeout for media-load service requests in milliseconds',
      defaultValue: '30000',
      required: false,
      advanced: true,
      transform: transforms.number({ min: 1000, integer: true }),
    }),
  },
});
