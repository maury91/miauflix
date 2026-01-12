import { createCache } from 'cache-manager';

import type { RequestService } from '@services/request/request.service';
import type { StatsService } from '@services/stats/stats.service';
import { serviceConfiguration, transforms, variable } from '@utils/config';

import { YTSApi } from './yts.api';

export const ytsConfigurationDefinition = serviceConfiguration({
  name: 'YTS)',
  description: 'Service for fetching movie sources from YTS',
  variables: {
    YTS_API_URL: variable({
      description: 'URL for the YTS API',
      example: 'https://yts.mx',
      defaultValue: 'https://yts.mx',
      required: false,
      transform: transforms.url(),
    }),
  },
  test: async (requestService: RequestService, statsService: StatsService) => {
    try {
      const cache = createCache();
      const ytsApi = new YTSApi(cache, statsService, requestService);

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
