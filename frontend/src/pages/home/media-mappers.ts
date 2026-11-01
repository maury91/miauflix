import { mediaApi } from '@features/media/api/media.api';
import type { MediaDto, MovieResponse, ProgressEntry, ShowResponse } from '@miauflix/backend';
import type { RootState } from '@store/store';

/** Build a movie card from a movie details response. */
export function mediaFromMovie(response: MovieResponse): MediaDto {
  return {
    _type: 'movie',
    id: response.id,
    mediaId: response.mediaId,
    imdbId: response.imdbId,
    title: response.title,
    overview: response.overview,
    poster: response.poster,
    backdrop: response.backdrop,
    backdropFocus: response.backdropFocus,
    logo: response.logo,
    heroLogo: response.heroLogo,
    artworkRevision: response.artworkRevision,
    cardLogoStatus: response.cardLogoStatus,
    heroLogoStatus: response.heroLogoStatus,
    genres: response.genres,
    popularity: response.popularity,
    rating: response.rating,
    releaseDate: response.releaseDate,
    runtime: response.runtime,
  };
}

/** Build a show card from a show details response; missing optional fields become empty. */
export function mediaFromShow(response: ShowResponse): MediaDto {
  return {
    _type: 'tvshow',
    id: response.id,
    mediaId: response.mediaId,
    imdbId: response.imdbId,
    name: response.title,
    overview: response.overview ?? '',
    poster: response.poster ?? '',
    backdrop: response.backdrop ?? '',
    backdropFocus: response.backdropFocus,
    logo: response.logo ?? undefined,
    heroLogo: response.heroLogo ?? undefined,
    artworkRevision: response.artworkRevision,
    cardLogoStatus: response.cardLogoStatus,
    heroLogoStatus: response.heroLogoStatus,
    genres: response.genres,
    popularity: response.popularity ?? 0,
    rating: response.rating ?? 0,
    firstAirDate: response.firstAirDate ?? '',
  };
}

/**
 * Cards built from cached responses, so the same response always gives the same card object:
 * memoized rows then skip titles whose data did not change.
 */
const cardByResponse = new WeakMap<object, MediaDto>();
const cachedCard = <T extends object>(response: T, build: (response: T) => MediaDto) => {
  let card = cardByResponse.get(response);
  if (!card) {
    card = build(response);
    cardByResponse.set(response, card);
  }
  return card;
};

/**
 * Build the card for a progress entry from cached catalog data, or null when it is not cached.
 * Returns the same object while the cached response is unchanged.
 */
export function mediaFromProgress(
  state: Pick<RootState, 'mediaApi'>,
  entry: ProgressEntry
): MediaDto | null {
  if (entry.playable.kind === 'movie') {
    const response = mediaApi.endpoints.getMovie.select(entry.playable.mediaId)(state).data;
    return response ? cachedCard(response, mediaFromMovie) : null;
  }
  const response = mediaApi.endpoints.getShow.select(entry.playable.showMediaId)(state).data;
  return response ? cachedCard(response, mediaFromShow) : null;
}
