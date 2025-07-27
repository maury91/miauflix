import { access, constants, mkdir } from 'fs/promises';
import path from 'path';

import { ENV } from '@constants';
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

const scrapeTrackers = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.openbittorrent.com:80/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
];

export const downloadConfigurationDefinition = serviceConfiguration({
  name: 'Download',
  description: 'Download and streaming configuration',
  variables: {
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
    SCRAPE_TRACKERS: variable({
      description: 'Scrape trackers for peer-to-peer client',
      example: 'udp://tracker1.example.com:1337,udp://tracker2.example.com:1337',
      defaultValue: scrapeTrackers.join(','),
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
    DOWNLOAD_PATH: variable({
      description: 'Directory for storing downloaded media files (must be writable)',
      required: false,
      defaultValue: path.resolve(process.cwd(), './downloads'),
      example: '/var/miauflix/cache',
      transform: transforms.string({ minLength: 1 }),
    }),
    DOWNLOAD_SALT: variable({
      description: 'Salt for generating secure storage paths (32+ character random string)',
      required: false,
      defaultValue: 'miauflix-download-cache-salt-2024-secure-random-string',
      example: 'your-32-character-random-salt-string',
      transform: transforms.string({ minLength: 32 }),
    }),
  },
  test: async () => {
    // Test that the cache directory is writable
    const cachePath = ENV('DOWNLOAD_PATH');
    try {
      await mkdir(cachePath, { recursive: true });
      await access(cachePath, constants.W_OK);
    } catch (error) {
      console.error(error);
      throw new Error(
        `Download cache path ${cachePath} is not writable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});
