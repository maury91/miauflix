import type { MovieDetail, TVShowDetail } from '@services/catalog/catalog.types';

import type { MediaDto, MovieDto, TVShowDto } from './list.types';

/** Catalog detail joined with the local index id for list rendering. */
export type SerializableMedia = { localId: number } & (MovieDetail | TVShowDetail);

export function serializeMedia(media: SerializableMedia): MediaDto {
  if (media.mediaType === 'movie') {
    const movie = media as MovieDetail & { localId: number };
    return {
      _type: 'movie',
      id: movie.localId,
      mediaId: movie.mediaId,
      imdbId: movie.imdbId ?? undefined,
      title: movie.title,
      overview: movie.overview,
      tagline: movie.tagline ?? undefined,
      poster: movie.poster,
      backdrop: movie.backdrop,
      logo: movie.logo,
      genres: movie.genres.map(genre => genre.name),
      popularity: movie.popularity,
      rating: movie.rating,
      releaseDate: movie.releaseDate || '',
      runtime: movie.runtime,
    } satisfies MovieDto;
  }
  const show = media as TVShowDetail & { localId: number };
  return {
    _type: 'tvshow',
    id: show.localId,
    mediaId: show.mediaId,
    imdbId: show.imdbId ?? undefined,
    name: show.name,
    overview: show.overview,
    tagline: show.tagline ?? undefined,
    poster: show.poster,
    backdrop: show.backdrop,
    logo: show.logo,
    genres: show.genres.map(genre => genre.name),
    popularity: show.popularity,
    rating: show.rating,
    firstAirDate: show.firstAirDate || '',
    episodeRunTime: show.episodeRunTime,
    type: show.type,
    inProduction: show.inProduction,
  } satisfies TVShowDto;
}
