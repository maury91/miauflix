import type { TranslatedMedia } from '@services/media/media.types';

import type { MediaDto, MovieDto, TVShowDto } from './list.types';

function toIsoString(val: Date | string): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') return val;
  return '';
}

export function serializeMedia(media: TranslatedMedia): MediaDto {
  if ('title' in media) {
    // Movie
    return {
      _type: 'movie',
      id: media.id,
      tmdbId: media.tmdbId,
      imdbId: media.imdbId ?? undefined,
      title: media.title,
      overview: media.overview,
      tagline: media.tagline ?? undefined,
      poster: media.poster,
      backdrop: media.backdrop,
      logo: media.logo,
      genres: media.genres,
      popularity: media.popularity,
      rating: media.rating,
      releaseDate: media.releaseDate || '',
      runtime: 'runtime' in media ? media.runtime : undefined,
      createdAt: toIsoString(media.createdAt),
      updatedAt: toIsoString(media.updatedAt),
    } satisfies MovieDto;
  } else {
    // TV Show
    return {
      _type: 'tvshow',
      id: media.id,
      tmdbId: media.tmdbId,
      imdbId: media.imdbId ?? undefined,
      name: media.name,
      overview: media.overview,
      tagline: media.tagline ?? undefined,
      poster: media.poster,
      backdrop: media.backdrop,
      genres: media.genres,
      popularity: media.popularity,
      rating: media.rating,
      firstAirDate: media.firstAirDate || '',
      episodeRunTime: 'episodeRunTime' in media ? media.episodeRunTime : undefined,
      type: 'type' in media ? media.type : undefined,
      inProduction: 'inProduction' in media ? media.inProduction : undefined,
      createdAt: toIsoString(media.createdAt),
      updatedAt: toIsoString(media.updatedAt),
    } satisfies TVShowDto;
  }
}
