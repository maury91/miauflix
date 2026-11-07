import { serviceConfiguration, transforms, variable } from '@utils/config';

export const vpnConfigurationDefinition = serviceConfiguration({
  name: 'VPN Detection Service',
  // The checks run in source search and media load; this is the default of their own settings.
  description: 'Configuration for VPN detection and monitoring',
  variables: {
    DISABLE_VPN_CHECK: variable({
      description: 'Disable the VPN check of source search and media load (default for both)',
      booleanStateDescriptions: {
        true: 'VPN check disabled',
        false: 'VPN check enabled',
      },
      example: 'false',
      defaultValue: 'false',
      required: false,
      advanced: true,
      transform: transforms.boolean(),
    }),
  },
});
