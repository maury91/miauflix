import type { ServiceConfigSchema } from '@miauflix/contract';

export const createSourcesConfigSchema = (): ServiceConfigSchema => ({
  groups: [
    {
      id: 'SOURCES',
      name: 'Sources',
      description: 'Source search providers and VPN protection.',
      variables: [
        ['SOURCES_DISABLE_VPN_CHECK', 'false', 'boolean'],
        ['SOURCES_KNOWN_VPN_IPS', '', 'text'],
        ['FLARESOLVERR_URL', '', 'text'],
        ['SOURCES_REQUEST_TIMEOUT_MS', '15000', 'number'],
        ['SOURCES_HEDGE_MS', '800', 'number'],
        ['SOURCES_MIN_SEEDERS', '5', 'number'],
        ['SOURCES_MOVIE_MIN_HEALTHY', '3', 'number'],
        ['SOURCES_DEFAULT_DAILY_BUDGET', '2000', 'number'],
        ['THE_RARBG_API_URL', 'https://therarbg.to', 'text'],
        ['YTS_API_URL', 'https://yts.mx', 'text'],
      ].map(([key, defaultValue, type]) => ({
        key,
        description: key.replaceAll('_', ' '),
        defaultValue,
        required: false,
        advanced: key !== 'SOURCES_DISABLE_VPN_CHECK',
        inputType: type as 'boolean' | 'number' | 'text',
        ...(type === 'number' ? { numberOptions: { min: 1, integer: true } } : {}),
      })),
    },
  ],
});
