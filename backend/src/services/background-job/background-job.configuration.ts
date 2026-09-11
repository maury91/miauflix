import { serviceConfiguration, transforms, variable } from '@utils/config';

export const queueConfigurationDefinition = serviceConfiguration({
  name: 'Background Queue',
  description: 'Bunqueue broker connection used for durable background work',
  restartable: false,
  variables: {
    BUNQUEUE_HOST: variable({
      description: 'Hostname of the Bunqueue broker',
      required: false,
      defaultValue: '127.0.0.1',
      example: 'bunqueue',
    }),
    BUNQUEUE_PORT: variable({
      description: 'TCP port of the Bunqueue broker',
      required: false,
      defaultValue: '6789',
      example: '6789',
      transform: transforms.number({ min: 1, max: 65535, integer: true }),
    }),
    BUNQUEUE_TOKEN: variable({
      description: 'Optional Bunqueue broker authentication token',
      required: false,
      defaultValue: '',
      transform: transforms.optional(transforms.string({ minLength: 1 })),
    }),
  },
});
