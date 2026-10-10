import { serviceConfiguration, variable } from '@utils/config';

export const subtitlesConfigurationDefinition = serviceConfiguration({
  name: 'Subtitles',
  description:
    'Search and deliver movie subtitles from OpenSubtitles.com. Configure the server-side API key below to enable subtitle search.',
  variables: {
    OPENSUBTITLES_API_KEY: variable({
      label: 'OpenSubtitles API key',
      description:
        'The API key assigned to this Miauflix server for OpenSubtitles.com. It is used for subtitle searches and downloads and is never exposed to viewers.',
      required: false,
      password: true,
      link: 'https://www.opensubtitles.com/consumers',
      linkLabel: 'Open OpenSubtitles API documentation',
    }),
  },
});
