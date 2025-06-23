import { serviceConfiguration, transforms, variable } from '@utils/config';

export const vpnConfigurationDefinition = serviceConfiguration({
  name: 'VPN Detection Service',
  description: 'Configuration for VPN detection and monitoring',
  variables: {
    DISABLE_VPN_CHECK: variable({
      description: 'Disable VPN check',
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
