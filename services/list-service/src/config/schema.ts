import type { ServiceConfigSchema } from '@miauflix/service-contracts';

export const createListConfigSchema = (defaultApiUrl: string): ServiceConfigSchema => ({
  name: 'List Service',
  description: 'Trakt-backed public and personal lists.',
  variables: [
    {
      key: 'TRAKT_API_URL',
      description: 'Trakt API URL',
      required: false,
      inputType: 'text',
      defaultValue: defaultApiUrl,
      testRelevant: true,
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
      key: 'TRAKT_CLIENT_SECRET',
      label: 'Trakt Client Secret',
      description:
        'Copy the client secret from the same Trakt API application settings page and keep it private.',
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
        'Use the exact redirect URI registered in your Trakt application. Miauflix uses it when refreshing Trakt authorization; the current site origin is suggested automatically.',
      required: true,
      inputType: 'text',
      defaultValueSource: 'browser-origin',
      example: 'https://miauflix.example',
      link: 'https://trakt.tv/oauth/applications',
      linkLabel: 'Open Trakt application settings',
    },
  ],
});
