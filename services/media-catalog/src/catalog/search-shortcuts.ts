import type { ProviderGenreFilter } from '../provider/provider';

/** Language whose genre names are the fallback when a translation is missing. */
export const DEFAULT_GENRE_LANGUAGE = 'en';

/**
 * Search shortcuts that are not catalog genres. Anime is Japanese animation until it comes from
 * MyAnimeList.
 */
export const SEARCH_SHORTCUTS: Readonly<
  Record<'anime', { name: string; filter: ProviderGenreFilter }>
> = {
  anime: {
    name: 'Anime',
    filter: { movieGenreIds: [16], tvGenreIds: [16], originalLanguage: 'ja' },
  },
};
