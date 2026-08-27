import { serviceConfiguration, transforms, variable } from '@utils/config';

export const vpnConfigurationDefinition = serviceConfiguration({
  name: 'VPN Detection Service',
  description: 'Configuration for VPN detection and monitoring',
  variables: {
    DISABLE_VPN_CHECK: variable({
      description: 'Disable VPN check',
      booleanStateDescriptions: {
        true: 'VPN check disabled',
        false: 'VPN check enabled',
      },
      example: 'false',
      defaultValue: 'false',
      required: false,
      transform: transforms.boolean(),
    }),
  },
});
