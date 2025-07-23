import { serviceConfiguration, transforms, variable } from '@utils/config';

export const storageConfigurationDefinition = serviceConfiguration({
  name: 'Storage',
  description: 'Service for tracking and managing storage',
  variables: {
    STORAGE_THRESHOLD: variable({
      description:
        'Maximum storage capacity that can be used for downloaded content. Supports any unit (GB, TB, MB) or percentage (e.g., "80%" of the total storage). When this threshold is reached, the oldest content will be automatically removed to maintain storage limits.',
      example: '70%',
      required: false,
      defaultValue: '50GB',
      // FixMe: Add support for percentage
      transform: transforms.size(),
    }),
  },
  test: async () => {
    return;
  },
});
