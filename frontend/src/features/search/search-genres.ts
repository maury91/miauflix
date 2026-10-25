import type { SearchGenreKey } from '@miauflix/backend';

/** Genre shortcuts in display order, matching the catalog's `SEARCH_GENRES` keys. */
export const SEARCH_GENRE_CHIPS: ReadonlyArray<{ key: SearchGenreKey; label: string }> = [
  { key: 'action', label: 'Action' },
  { key: 'comedy', label: 'Comedy' },
  { key: 'drama', label: 'Drama' },
  { key: 'thriller', label: 'Thriller' },
  { key: 'scifi', label: 'Sci-Fi' },
  { key: 'horror', label: 'Horror' },
  { key: 'animation', label: 'Animation' },
  { key: 'anime', label: 'Anime' },
  { key: 'documentary', label: 'Documentary' },
  { key: 'fantasy', label: 'Fantasy' },
];

export function searchGenreLabel(key: string): string {
  return SEARCH_GENRE_CHIPS.find(chip => chip.key === key)?.label ?? key;
}
