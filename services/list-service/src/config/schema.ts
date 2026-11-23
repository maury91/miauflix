import type { ServiceConfigSchema } from '@miauwatch/contract';

export const createListConfigSchema = (): ServiceConfigSchema => ({
  groups: [
    {
      id: 'TRAKT',
      name: 'Trakt',
      description: 'Shared Trakt API application credentials.',
      variables: [
        {
          key: 'TRAKT_API_URL',
          description: 'Trakt API URL',
          required: false,
          inputType: 'text',
          defaultValue: 'https://api.trakt.tv',
          testRelevant: true,
        },
        {
          key: 'TRAKT_AUTH_URL',
          description: 'Trakt OAuth URL, used for account authorization and token refresh',
          required: false,
          inputType: 'text',
          defaultValue: 'https://auth.trakt.tv',
        },
        {
          key: 'TRAKT_CLIENT_ID',
          label: 'Trakt Client ID',
          description:
            'Create a Trakt API application, then copy its client ID from the application settings.',
          required: true,
          secret: true,
          inputType: 'password',
          link: 'https://trakt.tv/oauth/applications',
          linkLabel: 'Open Trakt application settings',
          testRelevant: true,
        },
        {
          key: 'TRAKT_REDIRECT_URI',
          label: 'Trakt Redirect URI',
          description:
            'Use the exact redirect URI registered in your Trakt application. Miauwatch uses it when refreshing Trakt authorization; the current site origin is suggested automatically.',
          required: true,
          inputType: 'text',
          defaultValueSource: 'browser-origin',
          example: 'https://miauwatch.example',
          link: 'https://trakt.tv/oauth/applications',
          linkLabel: 'Open Trakt application settings',
        },
      ],
    },
  ],
});
