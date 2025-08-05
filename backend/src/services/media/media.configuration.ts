import { serviceConfiguration, transforms, variable } from '@utils/config';

export const mediaConfigurationDefinition = serviceConfiguration({
  name: 'Media Service',
  description: 'Configuration for media metadata synchronization',
  variables: {
    EPISODE_SYNC_MODE: variable({
      description: 'Episode metadata sync strategy',
      example: 'ON_DEMAND',
      defaultValue: 'ON_DEMAND',
      required: false,
      // FixMe: Implement transforms.enum({ values: ['GREEDY', 'ON_DEMAND'] })
      transform: transforms.string({
        pattern: /^(GREEDY|ON_DEMAND)$/,
      }),
    }),
  },
  test: async () => {
    // No external API calls needed for this configuration
    return;
  },
});
