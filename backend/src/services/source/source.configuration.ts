import { randomBytes } from 'crypto';

import { serviceConfiguration, transforms, variable } from '@utils/config';

const staticTrackers = [
  'udp://47.ip-51-68-199.eu:6969/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://open.stealth.si:80/announce',
  'udp://opentracker.i2p.rocks:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://tracker.internetwarriors.net:1337',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://valakas.rollo.dnsabr.com:2710/announce',
  'udp://www.torrent.eu.org:451/announce',
  ///----
  'udp://open.demonii.com:1337/announce',
  'http://tracker.openbittorrent.com:80/announce',
  'udp://uploads.gamecoast.net:6969/announce',
  'udp://tracker1.bt.moack.co.kr:80/announce',
  'udp://tracker.theoks.net:6969/announce',
  'udp://tracker.ccp.ovh:6969/announce',
  'udp://tracker.bittor.pw:1337/announce',
  'udp://tracker.4.babico.name.tr:3131/announce',
  'udp://thouvenin.cloud:6969/announce',
  'udp://sanincode.com:6969/announce',
  'udp://retracker01-msk-virt.corbina.net:80/announce',
  'udp://private.anonseed.com:6969/announce',
  'udp://p4p.arenabg.com:1337/announce',
];

export const sourceConfigurationDefinition = serviceConfiguration({
  name: 'Source Service',
  description: 'Configuration for the source service',
  variables: {
    SOURCE_SECURITY_KEY: variable({
      description: 'Base64 AES-256 encryption key for source metadata identifiers',
      example: 'dGhpc19pc19hX3NhbXBsZV8yNTZfYml0X2tleQ==',
      defaultValue: () => randomBytes(32).toString('base64'),
      skipUserInteraction: true,
      required: true,
    }),
    CONTENT_CONNECTION_LIMIT: variable({
      description: 'Maximum number of connections for peer-to-peer client',
      example: '100',
      defaultValue: '100',
      skipUserInteraction: true,
      required: true,
      transform: transforms.number({ min: 1, integer: true }),
    }),
    CONTENT_DOWNLOAD_LIMIT: variable({
      description: 'Download limit for peer-to-peer client',
      example: '20MB',
      defaultValue: '20MB',
      skipUserInteraction: true,
      required: true,
      transform: transforms.size(['KB', 'MB', 'GB', 'TB']),
    }),
    CONTENT_UPLOAD_LIMIT: variable({
      description: 'Upload limit for peer-to-peer client',
      example: '20MB',
      defaultValue: '20MB',
      skipUserInteraction: true,
      required: true,
      transform: transforms.size(['KB', 'MB', 'GB', 'TB']),
    }),
    DISABLE_DISCOVERY: variable({
      description: 'Disable DHT for peer-to-peer client',
      example: 'false',
      defaultValue: 'false',
      required: false,
      transform: transforms.boolean(),
    }),
    STATIC_TRACKERS: variable({
      description: 'Static trackers for peer-to-peer client',
      example: 'udp://tracker1.example.com:1337,udp://tracker2.example.com:1337',
      defaultValue: staticTrackers.join(','),
      required: false,
      transform: transforms.stringArray(),
    }),
    BEST_TRACKERS_DOWNLOAD_URL: variable({
      description: 'URL to download best trackers',
      example: 'https://example.com/trackers_best.txt',
      defaultValue:
        'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt',
      required: false,
      transform: transforms.string(),
    }),
    BLACKLISTED_TRACKERS_DOWNLOAD_URL: variable({
      description: 'URL to download blacklisted trackers',
      example: 'https://example.com/blacklist.txt',
      defaultValue: 'https://raw.githubusercontent.com/ngosang/trackerslist/master/blacklist.txt',
      required: false,
      transform: transforms.string(),
    }),
    DOWNLOAD_ALL_SOURCE_FILES: variable({
      description:
        'Download metadata files for all sources instead of only the top 2 sources per media',
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
