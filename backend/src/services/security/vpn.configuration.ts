import { serviceConfiguration } from '@mytypes/configuration';

export const vpnConfigurationDefinition = serviceConfiguration({
  name: 'VPN Detection Service',
  description: 'Configuration for VPN detection and monitoring',
  variables: {
    DISABLE_VPN_CHECK: {
      description: 'Disable VPN check',
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
