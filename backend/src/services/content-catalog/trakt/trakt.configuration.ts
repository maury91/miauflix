import { serviceConfiguration, transforms, variable } from '@utils/config';

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
});
