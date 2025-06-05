import { randomBytes } from 'crypto';

import { serviceConfiguration } from '@mytypes/configuration';

export const sourceConfigurationDefinition = serviceConfiguration({
  name: 'Source Service',
  description: 'Configuration for the source service',
  variables: {
    SOURCE_SECURITY_KEY: {
      description: 'Base64 AES-256 encryption key for torrent identifiers',
      example: 'dGhpc19pc19hX3NhbXBsZV8yNTZfYml0X2tleQ==',
      defaultValue: () => randomBytes(32).toString('base64'),
      skipUserInteraction: true,
      required: true,
    },
    CONTENT_CONNECTION_LIMIT: {
      description: 'Maximum number of connections for WebTorrent',
      example: '100',
      defaultValue: '100',
      skipUserInteraction: true,
      required: true,
    },
    CONTENT_DOWNLOAD_LIMIT: {
      description: 'Download limit for WebTorrent in megabytes per second',
      example: '20',
      defaultValue: '20',
      skipUserInteraction: true,
      required: true,
    },
    CONTENT_UPLOAD_LIMIT: {
      description: 'Upload limit for WebTorrent in megabytes per second',
      example: '20',
      defaultValue: '20',
      skipUserInteraction: true,
      required: true,
    },
    DISABLE_DISCOVERY: {
      description: 'Disable DHT for WebTorrent',
      example: 'false',
      defaultValue: 'false',
      required: false,
    },
  },
  test: async () => {
    // Placeholder for any test logic if needed
    return;
  },
});
