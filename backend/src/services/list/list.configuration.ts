import { serviceConfiguration, transforms, variable } from '@utils/config';

export const listConfigurationDefinition = serviceConfiguration({
  name: 'List Service',
  description: 'Standalone provider-backed list and account integration service.',
  variables: {
    LIST_SERVICE_URL: variable({
      description: 'URL of the internal list service',
      example: 'http://localhost:3002',
      defaultValue: 'http://localhost:3002',
      required: true,
      advanced: true,
      testRelevant: true,
      transform: transforms.url(),
    }),
    LIST_SERVICE_TIMEOUT_MS: variable({
      description: 'Timeout for list service requests in milliseconds',
      example: '30000',
      defaultValue: '30000',
      required: false,
      advanced: true,
      transform: transforms.number({ min: 1000, integer: true }),
    }),
    REFRESH_LISTS_INTERVAL: variable({
      description: 'Interval in seconds between public list refreshes',
      defaultValue: '3600',
      required: false,
      advanced: true,
      transform: transforms.number({ min: 60, integer: true }),
    }),
  },
});
