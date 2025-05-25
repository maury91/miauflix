import { serviceConfiguration } from '@mytypes/configuration';

export const sourceConfigurationDefinition = serviceConfiguration({
  name: 'Source Service',
  description: 'Configuration for the source service',
  variables: {
    WEBTORRENT_MAX_CONNS: {
      description: 'Maximum number of connections for WebTorrent',
      example: '100',
      defaultValue: '100',
      skipUserInteraction: true,
      required: true,
    },
    WEBTORRENT_DOWNLOAD_LIMIT: {
      description: 'Download limit for WebTorrent in megabytes per second',
      example: '20',
      defaultValue: '20',
      skipUserInteraction: true,
      required: true,
    },
    WEBTORRENT_UPLOAD_LIMIT: {
      description: 'Upload limit for WebTorrent in megabytes per second',
      example: '20',
      defaultValue: '20',
      skipUserInteraction: true,
      required: true,
    },
  },
  test: async () => {
    // Placeholder for any test logic if needed
    return;
  },
});
