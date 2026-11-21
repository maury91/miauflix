import { getActiveLanguage } from '@shared/i18n';

/** The languages catalog data in the cache was asked for in. */
const requested = new Set<string>();

/**
 * The language to ask the catalog for (titles, overviews, genres): the interface's. Remembers it,
 * so a later language change knows whether cached data needs loading again.
 */
export function catalogLanguage(): string {
  const language = getActiveLanguage();
  requested.add(language);
  return language;
}

/**
 * Whether some cached catalog data was loaded in a language other than `language`. Forgets the
 * languages asked for so far: the caller reloads that data in `language`.
 */
export function takeStaleCatalogLanguage(language: string): boolean {
  const stale = [...requested].some(other => other !== language);
  requested.clear();
  return stale;
}
