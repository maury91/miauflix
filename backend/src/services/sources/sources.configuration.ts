import { serviceConfiguration, transforms, variable } from '@utils/config';

export const sourcesConfigurationDefinition = serviceConfiguration({
  name: 'Sources',
  description: 'Source search providers and VPN protection.',
  variables: {
    SOURCES_SERVICE_URL: variable({
      description: 'URL of the internal sources service',
      defaultValue: 'http://localhost:3003',
      required: true,
      advanced: true,
      testRelevant: true,
      transform: transforms.url(),
    }),
    SOURCES_SERVICE_TIMEOUT_MS: variable({
      description: 'Timeout for sources service requests in milliseconds',
      defaultValue: '30000',
      required: false,
      advanced: true,
      transform: transforms.number({ min: 1000, integer: true }),
    }),
  },
});
