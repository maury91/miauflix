import { serviceConfiguration, transforms, variable } from '@utils/config';

export const storageConfigurationDefinition = serviceConfiguration({
  name: 'Storage',
  description: 'Service for tracking and managing storage',
  variables: {
    STORAGE_THRESHOLD: variable({
      description:
        'Maximum disk space available to downloaded content. When reached, the oldest content is removed to stay within this limit.',
      example: '50GB',
      required: false,
      defaultValue: '50GB',
      // FixMe: Add support for percentage
      transform: transforms.size(),
    }),
    STORAGE_PLAYBACK_RESERVE: variable({
      description:
        'Storage kept available for on-demand playback; background downloads must leave this amount free.',
      example: '10GB',
      required: false,
      defaultValue: '10GB',
      transform: transforms.size(),
    }),
  },
});
