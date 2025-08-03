import { randomBytes } from 'crypto';

import { serviceConfiguration, transforms, variable } from '@utils/config';

export const sourceConfigurationDefinition = serviceConfiguration({
  name: 'Source Service',
  description: 'Configuration for the source service',
  variables: {
    SOURCE_SECURITY_KEY: variable({
      description: 'Base64 AES-256 encryption key for source metadata identifiers',
      example: 'dGhpc19pc19hX3NhbXBsZV8yNTZfYml0X2tleQ==',
      defaultValue: () => randomBytes(32).toString('base64'),
      skipUserInteraction: true,
      required: true,
    }),
    CONTENT_CONNECTION_LIMIT: variable({
      description: 'Maximum number of connections for peer-to-peer client',
      example: '100',
      defaultValue: '100',
      skipUserInteraction: true,
      required: true,
      transform: transforms.number({ min: 1, integer: true }),
    }),
    DOWNLOAD_ALL_SOURCE_FILES: variable({
      description:
        'Download metadata files for all sources instead of only the top 2 sources per media',
      example: 'false',
      defaultValue: 'false',
      required: false,
      transform: transforms.boolean(),
    }),
  },
  test: async () => {
    // Placeholder for any test logic if needed
    return;
  },
});
