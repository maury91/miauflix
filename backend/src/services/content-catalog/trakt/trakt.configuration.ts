import { serviceConfiguration, transforms, variable } from '@utils/config';

import { TraktApi } from './trakt.api';

export const traktConfigurationDefinition = serviceConfiguration({
  name: 'Trakt.tv',
  description: 'Service for tracking movies and TV shows watched by users',
  variables: {
    TRAKT_API_URL: variable({
      description: 'URL for the Trakt API',
      example: 'https://api.trakt.tv',
      defaultValue: 'https://api.trakt.tv',
      required: false,
      transform: transforms.url(),
    }),
    TRAKT_CLIENT_ID: variable({
      description: 'Client ID for the Trakt API',
      link: 'https://trakt.tv/oauth/applications',
      example: 'abc123def456ghi789',
      required: true,
      password: true,
    }),
    TRAKT_CLIENT_SECRET: variable({
      description: 'Client Secret for the Trakt API',
      link: 'https://trakt.tv/oauth/applications',
      example: 'secretkey123456789',
      required: true,
      password: true,
    }),
  },
  test: async () => {
    try {
      const traktApi = new TraktApi();

      await traktApi.test();
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'status' in error) {
        const err = error as { status: number };
        if (err.status === 401) {
          throw new Error(`Invalid Client ID`);
        }
        throw new Error(`Connection error: ${err.status}`);
      }
      throw error;
    }
  },
});
