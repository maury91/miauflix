import { resolve } from 'node:path';

import type { ConfigVariable, ServiceConfigSchema } from '@miauflix/contract';
import { vpnConfigVariables } from '@miauflix/vpn-guard';

/** Scrape trackers: well-known UDP trackers that answer multi-hash scrapes. */
export const DEFAULT_SCRAPE_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.openbittorrent.com:80/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
];

/** Announce trackers added to every torrent, on top of the downloaded best-trackers list. */
export const DEFAULT_STATIC_TRACKERS = [
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

/** Sizes such as `20MB`, in binary units, as the backend has always read them. */
export const SIZE_PATTERN = /^(\d+)\s*(B|KB|MB|GB|TB)$/i;

const text = (variable: Omit<ConfigVariable, 'inputType'>): ConfigVariable => ({
  ...variable,
  inputType: 'text',
});

/**
 * The engine's settings. The keys are the backend's former download and storage settings, so
 * values saved there (or set in its environment) keep applying.
 */
export const createMediaLoadConfigSchema = (
  defaultDownloadPath = resolve(process.cwd(), 'downloads')
): ServiceConfigSchema => ({
  groups: [
    {
      id: 'MEDIA_LOAD',
      name: 'Media load',
      description: 'Torrent engine: downloads, encrypted storage and tracker scrapes.',
      variables: [
        ...vpnConfigVariables('MEDIA_LOAD'),
        text({
          key: 'CONTENT_DOWNLOAD_LIMIT',
          description: 'Download limit for peer-to-peer client',
          example: '20MB',
          defaultValue: '20MB',
          skipUserInteraction: true,
          required: true,
        }),
        text({
          key: 'CONTENT_UPLOAD_LIMIT',
          description: 'Upload limit for peer-to-peer client',
          example: '20MB',
          defaultValue: '20MB',
          skipUserInteraction: true,
          required: true,
        }),
        {
          key: 'CONTENT_CONNECTION_LIMIT',
          description: 'Maximum number of connections for peer-to-peer client',
          example: '100',
          defaultValue: '100',
          skipUserInteraction: true,
          required: true,
          inputType: 'number',
          numberOptions: { min: 1, integer: true },
        },
        {
          key: 'CONTENT_CONNECTION_BUDGET',
          description:
            'Total peer connections shared by all torrents. Each torrent gets a share by priority (a stream before background downloads); torrents stop taking new peers beyond their share once the budget is used up.',
          example: '200',
          defaultValue: '200',
          skipUserInteraction: true,
          required: true,
          inputType: 'number',
          numberOptions: { min: 1, integer: true },
        },
        {
          key: 'CONTENT_SEED_DURATION_SECONDS',
          label: 'Seeding duration after video download',
          description:
            'How many seconds to seed after the main video is fully downloaded. Set to 0 to stop seeding immediately.',
          example: '3600',
          defaultValue: '3600',
          required: true,
          inputType: 'number',
          numberOptions: { min: 0, integer: true },
        },
        {
          key: 'STORAGE_PAD_FILE_SIZES',
          description:
            'Pad downloaded files on disk to a rounded size, filled with random bytes, so their exact sizes cannot be matched to known torrents. Files grow by at most about 3% (files under 64 KiB take 64 KiB). Applies to downloads started since encryption version 2; turning it off leaves padded files readable.',
          booleanStateDescriptions: {
            true: 'File sizes padded',
            false: 'Exact file sizes',
          },
          example: 'false',
          defaultValue: 'false',
          required: false,
          inputType: 'boolean',
          advanced: true,
        },
        {
          key: 'DISABLE_DISCOVERY',
          description: 'Disable DHT for peer-to-peer client',
          booleanStateDescriptions: {
            true: 'DHT discovery disabled',
            false: 'DHT discovery enabled',
          },
          example: 'false',
          defaultValue: 'false',
          required: false,
          inputType: 'boolean',
        },
        text({
          key: 'STORAGE_THRESHOLD',
          description:
            'Maximum disk space available to downloaded content. When reached, the oldest content is removed to stay within this limit.',
          example: '50GB',
          defaultValue: '50GB',
          required: false,
        }),
        text({
          key: 'STORAGE_PLAYBACK_RESERVE',
          description:
            'Storage kept available for on-demand playback; background downloads must leave this amount free.',
          example: '10GB',
          defaultValue: '10GB',
          required: false,
        }),
        text({
          key: 'DOWNLOAD_PATH',
          description:
            'Directory for storing downloaded and encrypted media files (must be writable)',
          example: '/var/miauflix/cache',
          defaultValue: defaultDownloadPath,
          required: false,
          advanced: true,
        }),
        text({
          key: 'DOWNLOAD_SALT',
          description:
            'No longer used: new download folders get random names. Kept so existing configurations still load',
          example: 'your-32-character-random-salt-string',
          defaultValue: 'miauflix-download-cache-salt-2024-secure-random-string',
          required: false,
          advanced: true,
        }),
        text({
          key: 'STATIC_TRACKERS',
          description: 'Static trackers for peer-to-peer client',
          example: 'udp://tracker1.example.com:1337,udp://tracker2.example.com:1337',
          defaultValue: DEFAULT_STATIC_TRACKERS.join(','),
          required: false,
          advanced: true,
        }),
        text({
          key: 'BEST_TRACKERS_DOWNLOAD_URL',
          description: 'URL to download best trackers',
          example: 'https://example.com/trackers_best.txt',
          defaultValue:
            'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt',
          required: false,
          advanced: true,
        }),
        text({
          key: 'BLACKLISTED_TRACKERS_DOWNLOAD_URL',
          description: 'URL of the IP blocklist applied to peer connections',
          example: 'https://example.com/blacklist.txt',
          defaultValue:
            'https://raw.githubusercontent.com/ngosang/trackerslist/master/blacklist.txt',
          required: false,
          advanced: true,
        }),
        text({
          key: 'SCRAPE_TRACKERS',
          description: 'Tracker announce URLs used to scrape peer and seeder statistics',
          example: 'udp://tracker1.example.com:1337,udp://tracker2.example.com:1337',
          defaultValue: DEFAULT_SCRAPE_TRACKERS.join(','),
          required: false,
          advanced: true,
        }),
      ],
    },
  ],
});
