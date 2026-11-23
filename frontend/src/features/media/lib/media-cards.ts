import type { MediaDto, MovieResponse, ShowResponse } from '@miauwatch/backend';

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
