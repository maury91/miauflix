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

/** Build the card for a progress entry from cached catalog data, or null when it is not cached. */
export function mediaFromProgress(
  state: Pick<RootState, 'mediaApi'>,
  entry: ProgressEntry
): MediaDto | null {
  if (entry.playable.kind === 'movie') {
    const response = mediaApi.endpoints.getMovie.select(entry.playable.mediaId)(state).data;
    return response ? mediaFromMovie(response) : null;
  }
  const response = mediaApi.endpoints.getShow.select(entry.playable.showMediaId)(state).data;
  return response ? mediaFromShow(response) : null;
}
