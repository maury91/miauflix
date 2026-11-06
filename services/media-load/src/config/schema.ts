import type { ServiceConfigSchema } from '@miauflix/contract';

/** Scrape trackers: well-known UDP trackers that answer multi-hash scrapes. */
export const DEFAULT_SCRAPE_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.openbittorrent.com:80/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
];

export const createMediaLoadConfigSchema = (): ServiceConfigSchema => ({
  groups: [
    {
      id: 'MEDIA_LOAD',
      name: 'Media load',
      description: 'Torrent engine: tracker scrapes, and later downloads and storage.',
      variables: [
        {
          key: 'SCRAPE_TRACKERS',
          description: 'Tracker announce URLs used to scrape peer and seeder statistics',
          example: 'udp://tracker1.example.com:1337,udp://tracker2.example.com:1337',
          defaultValue: DEFAULT_SCRAPE_TRACKERS.join(','),
          required: false,
          advanced: true,
          inputType: 'text',
        },
      ],
    },
  ],
});
