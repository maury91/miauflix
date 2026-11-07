import type { ServiceConfigSchema } from '@miauflix/contract';
import { vpnConfigVariables } from '@miauflix/vpn-guard';

import { DEFAULT_SOURCES } from '../providers/cardigann/sources';

export const createSourcesConfigSchema = (): ServiceConfigSchema => ({
  groups: [
    {
      id: 'SOURCES',
      name: 'Sources',
      description: 'Source search providers and VPN protection.',
      variables: [
        ...vpnConfigVariables('SOURCES'),
        ...[
          ['FLARESOLVERR_URL', '', 'text'],
          ['SOURCES_REQUEST_TIMEOUT_MS', '15000', 'number'],
          ['SOURCES_HEDGE_MS', '800', 'number'],
          ['SOURCES_MIN_SEEDERS', '5', 'number'],
          ['SOURCES_MOVIE_MIN_HEALTHY', '3', 'number'],
          ['SOURCES_DEFAULT_DAILY_BUDGET', '2000', 'number'],
          ['CARDIGANN_SYNC_INTERVAL_MINUTES', '60', 'number'],
          ['CARDIGANN_DEFINITION_SOURCES', DEFAULT_SOURCES, 'text'],
        ].map(([key, defaultValue, type]) => ({
          key,
          description: key.replaceAll('_', ' '),
          defaultValue,
          required: false,
          advanced: true,
          inputType: type as 'number' | 'text',
          ...(type === 'number' ? { numberOptions: { min: 1, integer: true } } : {}),
        })),
      ],
    },
  ],
});
