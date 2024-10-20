import { asyncProviders } from './app.types';
import { ParseTorrent } from 'parse-torrent';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const imports = new Map<string, any>();

const dynamicImport = new Function('specifier', 'return import(specifier)') as <
  T = never
>(
  specifier: string
) => Promise<T>;

export const asyncImportFactory = <T>(
  provide: asyncProviders,
  library: string,
  field?: string
) => ({
  provide,
  useFactory: async (): Promise<T> => {
    const imported = imports.has(provide)
      ? imports.get(provide)
      : await dynamicImport(provide);
    imports.set(provide, imported);
    if (field) {
      return imported[field];
    }
    return imported;
  },
});

export type ParseTorrentImport = {
  default: ParseTorrent;
  remote: ParseTorrent['remote'];
  toMagnetURI: ParseTorrent['toMagnetURI'];
  toTorrentFile: ParseTorrent['toTorrentFile'];
};

export const parseTorrentProvider = asyncImportFactory(
  asyncProviders.parseTorrent,
  'parse-torrent'
);

export const webTorrentProvider = asyncImportFactory(
  asyncProviders.webTorrent,
  'webtorrent',
  'default'
);
