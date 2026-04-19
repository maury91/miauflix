import { serviceConfiguration, transforms, variable } from '@utils/config';

export const theRarbgConfigurationDefinition = serviceConfiguration({
  name: 'TheRARBG',
  description: 'Service for fetching media sources from TheRARBG',
  variables: {
    THE_RARBG_API_URL: variable({
      description: 'URL for the TheRARBG API',
      example: 'https://therarbg.to',
      defaultValue: 'https://therarbg.to',
      required: false,
      transform: transforms.url(),
    }),
  },
});
