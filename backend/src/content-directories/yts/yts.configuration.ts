import { serviceConfiguration, transforms, variable } from '@utils/config';

export const ytsConfigurationDefinition = serviceConfiguration({
  name: 'YTS)',
  description: 'Service for fetching movie sources from YTS',
  variables: {
    YTS_API_URL: variable({
      description: 'URL for the YTS API',
      example: 'https://yts.mx',
      defaultValue: 'https://yts.mx',
      required: false,
      transform: transforms.url(),
    }),
  },
});
