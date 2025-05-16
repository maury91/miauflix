import { serviceConfiguration } from '@mytypes/configuration';

import { YTSApi } from './yts.api';

export const ytsConfigurationDefinition = serviceConfiguration({
  name: 'YTS (YIFY Torrents)',
  description: 'Service for fetching YTS movie torrents information',
  variables: {
    YTS_API_URL: {
      description: 'URL for the YTS API',
      example: 'https://yts.mx/api/v2',
      defaultValue: 'https://yts.mx/api/v2',
      required: false,
    },
  },
  test: async () => {
    try {
      const ytsApi = new YTSApi();

      // Use test because it doesn't use cache
      const testResult = await ytsApi.test();

      if (!testResult) {
        throw new Error('Failed to connect to YTS API');
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
