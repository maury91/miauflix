import { serviceConfiguration, transforms, variable } from '@utils/config';

export const traktConfigurationDefinition = serviceConfiguration({
  name: 'Trakt.tv',
  description: 'Connect Trakt to sync your watch progress and personal lists across devices.',
  variables: {
    TRAKT_API_URL: variable({
      description: 'URL for the Trakt API',
      example: 'https://api.trakt.tv',
      defaultValue: 'https://api.trakt.tv',
      required: false,
      advanced: true,
      testRelevant: true,
      testFailureHelp: 'The URL may be incorrect, or Trakt may be temporarily unavailable.',
      transform: transforms.url(),
    }),
    TRAKT_CLIENT_ID: variable({
      description: 'Create or open a Trakt application, then copy its Client ID from the app page.',
      link: 'https://trakt.tv/oauth/applications',
      linkLabel: 'Open Trakt applications',
      example: 'abc123def456ghi789',
      required: true,
      testRelevant: true,
      testFailureHelp: 'The Client ID may be invalid or belong to a different application.',
      password: true,
    }),
    TRAKT_CLIENT_SECRET: variable({
      description:
        'Create or open a Trakt application, then copy its Client Secret from the app page.',
      link: 'https://trakt.tv/oauth/applications',
      linkLabel: 'Open Trakt applications',
      example: 'secretkey123456789',
      required: true,
      testRelevant: true,
      testFailureHelp:
        'The Client Secret may be invalid, expired, or no longer match the Client ID.',
      password: true,
    }),
  },
});
