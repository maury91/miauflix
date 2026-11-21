import type { MovieDetail, TVShowDetail } from '@miauflix/service-contracts';

/** TMDB's Animation genre. */
const ANIMATION_GENRE_ID = 16;

/**
 * Whether a title counts as anime for language preferences: Japanese animation (as the Anime
 * search shortcut defines it), or a show the catalog numbers by AniList entry.
 */
export function isAnimeDetail(detail: MovieDetail | TVShowDetail): boolean {
  if (detail.mediaType === 'tv' && detail.seasonLayout === 'anilist') return true;
  return (
    detail.originalLanguage === 'ja' && detail.genres.some(genre => genre.id === ANIMATION_GENRE_ID)
  );
}
