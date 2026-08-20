import { serviceConfiguration, transforms, variable } from '@utils/config';

export const theRarbgConfigurationDefinition = serviceConfiguration({
  name: 'TheRARBG',
  description: 'TheRARBG source provider for fetching media torrent sources',
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
