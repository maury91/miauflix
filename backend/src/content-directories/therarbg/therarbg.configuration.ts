import { createCache } from 'cache-manager';

import { serviceConfiguration, transforms, variable } from '@utils/config';

import { TheRARBGApi } from './therarbg.api';

export const theRarbgConfigurationDefinition = serviceConfiguration({
  name: 'TheRARBG',
  description: 'Service for fetching media sources from TheRARBG',
  variables: {
    THE_RARBG_API_URL: variable({
      description: 'URL for the TheRARBG API',
      example: 'https://therarbg.to',
      defaultValue: 'https://therarbg.to',
      required: false,
      transform: transforms.url(),
    }),
  },
  test: async () => {
    try {
      const cache = createCache();
      const theRarbgApi = new TheRARBGApi(cache);

      // Use test because it doesn't use cache
      const testResult = await theRarbgApi.test();

      if (!testResult) {
        throw new Error('Failed to connect to TheRARBG API');
      }
    } catch (error: unknown) {
      console.error(error);
      if (error) {
        if (typeof error === 'object' && error && 'status' in error) {
          throw new Error(`Connection error: ${error.status}`);
        }
        throw error;
      }
    }
  },
});
