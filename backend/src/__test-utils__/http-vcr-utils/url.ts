import { join } from 'path/posix';

import type { HttpVcrConfig } from './types';

export function getProviderFromUrl(
  url: string,
  providerMap: HttpVcrConfig['providerMap'],
  defaultProvider: string
): string {
  const provider = providerMap.find(p => url.includes(p.pattern));
  return provider ? provider.name : defaultProvider;
}

export function urlToFilepath(
  url: string,
  providerMap: HttpVcrConfig['providerMap'],
  defaultProvider: string,
  fixturesDir: string
): string {
  const provider = getProviderFromUrl(url, providerMap, defaultProvider);

  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const query = urlObj.search;
  const filename = `${path}${query}.json`;

  return join(fixturesDir, provider, filename);
}
