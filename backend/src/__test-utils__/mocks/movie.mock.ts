import {
  generateImdbId,
  generateMagnetLink,
  generateMovieMetadata,
  generateSourceMetadata,
} from '@__test-utils__/utils';
import { faker } from '@faker-js/faker';
import {
  AudioCodec,
  Language,
  Quality,
  Source,
  VideoCodec,
} from '@miauflix/source-metadata-extractor';

import type { SourceMetadata } from '@content-directories/content-directory.abstract';
import type { Episode } from '@entities/episode.entity';
import type { Movie } from '@entities/movie.entity';
import type { MovieSource } from '@entities/movie-source.entity';
import type { Season } from '@entities/season.entity';
import type { TVShow } from '@entities/tvshow.entity';
import type { MovieDetail, SeasonDetail, TVShowDetail } from '@services/catalog/catalog.types';

/**
 * Local slim media mirrors (movies, shows, seasons, episodes) and the catalog
 * detail payloads they are mirrored from.
 */

export function createMockMovie(overrides: Partial<Movie> = {}): Movie {
  const movieMetadata = generateMovieMetadata();

  return {
    id: overrides.id ?? faker.number.int({ min: 1, max: 100000 }),
    mediaId: overrides.mediaId ?? faker.number.int({ min: 1, max: 1000000 }),
    imdbId:
      typeof overrides.imdbId === 'string' && overrides.imdbId
        ? overrides.imdbId
        : generateImdbId(),
    title: overrides.title ?? movieMetadata.title,
    overview: overrides.overview ?? movieMetadata.overview,
    runtime: overrides.runtime ?? movieMetadata.runtime,
    trailer: overrides.trailer ?? (faker.datatype.boolean() ? faker.string.alphanumeric(11) : ''),
    rating: overrides.rating ?? movieMetadata.rating,
    popularity: overrides.popularity ?? movieMetadata.popularity,
    releaseDate: overrides.releaseDate ?? movieMetadata.releaseDate,
    poster: overrides.poster ?? movieMetadata.poster,
    backdrop: overrides.backdrop ?? movieMetadata.backdrop,
    contentDirectoriesSearched: overrides.contentDirectoriesSearched ?? [],
    sources: overrides.sources ?? [],
    createdAt: overrides.createdAt ?? faker.date.past(),
    updatedAt: overrides.updatedAt ?? faker.date.recent(),
    nextSourceSearchAt: overrides.nextSourceSearchAt ?? faker.date.future(),
    ...overrides,
  };
}

/** Catalog movie detail — the payload the local mirror is written through. */
export function createMockMovieDetail(overrides: Partial<MovieDetail> = {}): MovieDetail {
  const movieMetadata = generateMovieMetadata();

  return {
    mediaType: 'movie',
    mediaId: overrides.mediaId ?? faker.number.int({ min: 1, max: 1000000 }),
    imdbId: overrides.imdbId ?? generateImdbId(),
    title: overrides.title ?? movieMetadata.title,
    overview: overrides.overview ?? movieMetadata.overview,
    tagline: overrides.tagline ?? movieMetadata.tagline,
    releaseDate: overrides.releaseDate ?? movieMetadata.releaseDate,
    runtime: overrides.runtime ?? movieMetadata.runtime,
    poster: overrides.poster ?? movieMetadata.poster,
    backdrop: overrides.backdrop ?? movieMetadata.backdrop,
    logo: overrides.logo ?? movieMetadata.logo,
    genres: overrides.genres ?? [
      { id: 16, name: 'Animation' },
      { id: 10751, name: 'Family' },
    ],
    popularity: overrides.popularity ?? movieMetadata.popularity,
    rating: overrides.rating ?? movieMetadata.rating,
    detailsSyncedAt: overrides.detailsSyncedAt ?? new Date().toISOString(),
    ...overrides,
  };
}

export function createMockTVShow(overrides: Partial<TVShow> = {}): TVShow {
  return {
    id: overrides.id ?? faker.number.int({ min: 1, max: 100000 }),
    mediaId: overrides.mediaId ?? faker.number.int({ min: 1, max: 1000000 }),
    name: overrides.name ?? faker.lorem.words(3),
    overview: overrides.overview ?? faker.lorem.paragraph(),
    firstAirDate:
      overrides.firstAirDate ?? faker.date.past({ years: 20 }).toISOString().split('T')[0],
    poster: overrides.poster ?? `/posters/${faker.string.alphanumeric(8)}.jpg`,
    backdrop: overrides.backdrop ?? `/backdrops/${faker.string.alphanumeric(8)}.jpg`,
    imdbId: overrides.imdbId ?? generateImdbId(),
    status: overrides.status ?? 'Returning Series',
    popularity: overrides.popularity ?? faker.number.float({ min: 0, max: 100, fractionDigits: 1 }),
    rating: overrides.rating ?? faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
    watching: overrides.watching ?? false,
    seasons: overrides.seasons ?? [],
    createdAt: overrides.createdAt ?? faker.date.past(),
    updatedAt: overrides.updatedAt ?? faker.date.recent(),
    ...overrides,
  };
}

export function createMockTVShowDetail(overrides: Partial<TVShowDetail> = {}): TVShowDetail {
  const show = createMockTVShow();
  const seasons = overrides.seasons ?? [
    {
      mediaId: faker.number.int({ min: 1, max: 1000000 }),
      seasonNumber: 1,
      name: 'Season 1',
      overview: faker.lorem.paragraph(),
      airDate: show.firstAirDate,
      poster: show.poster,
      episodeCount: faker.number.int({ min: 4, max: 12 }),
      synced: false,
    },
  ];

  return {
    mediaType: 'tv',
    mediaId: overrides.mediaId ?? show.mediaId,
    imdbId: overrides.imdbId ?? show.imdbId ?? null,
    name: overrides.name ?? show.name,
    overview: overrides.overview ?? show.overview,
    tagline: overrides.tagline ?? faker.lorem.sentence(),
    firstAirDate: overrides.firstAirDate ?? show.firstAirDate,
    status: overrides.status ?? show.status,
    type: overrides.type ?? 'Scripted',
    inProduction: overrides.inProduction ?? true,
    episodeRunTime: overrides.episodeRunTime ?? [faker.number.int({ min: 30, max: 60 })],
    poster: overrides.poster ?? show.poster,
    backdrop: overrides.backdrop ?? show.backdrop,
    logo: overrides.logo ?? `/logos/${faker.string.alphanumeric(8)}.png`,
    genres: overrides.genres ?? [{ id: 18, name: 'Drama' }],
    popularity: overrides.popularity ?? show.popularity,
    rating: overrides.rating ?? show.rating,
    seasons,
    detailsSyncedAt: overrides.detailsSyncedAt ?? new Date().toISOString(),
    ...overrides,
  };
}

export function createMockSeason(overrides: Partial<Season> = {}): Season {
  return {
    id: overrides.id ?? faker.number.int({ min: 1, max: 100000 }),
    mediaId: overrides.mediaId ?? faker.number.int({ min: 1, max: 1000000 }),
    tvShowId: overrides.tvShowId ?? faker.number.int({ min: 1, max: 100000 }),
    seasonNumber: overrides.seasonNumber ?? 1,
    name: overrides.name ?? 'Season 1',
    overview: overrides.overview ?? faker.lorem.paragraph(),
    airDate: overrides.airDate ?? faker.date.past().toISOString().split('T')[0],
    posterPath: overrides.posterPath ?? `/posters/${faker.string.alphanumeric(8)}.jpg`,
    synced: overrides.synced ?? false,
    episodes: overrides.episodes ?? [],
    tvShow: overrides.tvShow ?? createMockTVShow(),
    createdAt: overrides.createdAt ?? faker.date.past(),
    updatedAt: overrides.updatedAt ?? faker.date.recent(),
    ...overrides,
  };
}

export function createMockSeasonDetail(overrides: Partial<SeasonDetail> = {}): SeasonDetail {
  const season = createMockSeason();
  const episodeCount = overrides.episodes?.length ?? faker.number.int({ min: 4, max: 10 });

  return {
    tvMediaId: overrides.tvMediaId ?? faker.number.int({ min: 1, max: 1000000 }),
    seasonMediaId: overrides.seasonMediaId ?? season.mediaId,
    seasonNumber: overrides.seasonNumber ?? season.seasonNumber,
    name: overrides.name ?? season.name,
    overview: overrides.overview ?? season.overview,
    airDate: overrides.airDate ?? season.airDate ?? null,
    poster: overrides.poster ?? season.posterPath ?? null,
    synced: overrides.synced ?? true,
    episodes:
      overrides.episodes ??
      Array.from({ length: episodeCount }, (_, index) => ({
        mediaId: faker.number.int({ min: 1, max: 1000000 }),
        episodeNumber: index + 1,
        name: `Episode ${index + 1}`,
        overview: faker.lorem.paragraph(),
        airDate: faker.date.past().toISOString().split('T')[0],
        still: `/stills/${faker.string.alphanumeric(8)}.jpg`,
      })),
    ...overrides,
  };
}

export function createMockEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: overrides.id ?? faker.number.int({ min: 1, max: 100000 }),
    mediaId: overrides.mediaId ?? faker.number.int({ min: 1, max: 1000000 }),
    seasonId: overrides.seasonId ?? faker.number.int({ min: 1, max: 100000 }),
    episodeNumber: overrides.episodeNumber ?? 1,
    name: overrides.name ?? 'Episode 1',
    overview: overrides.overview ?? faker.lorem.paragraph(),
    airDate: overrides.airDate ?? faker.date.past().toISOString().split('T')[0],
    stillPath: overrides.stillPath ?? `/stills/${faker.string.alphanumeric(8)}.jpg`,
    imdbId: overrides.imdbId ?? '',
    season: overrides.season ?? createMockSeason(),
    createdAt: overrides.createdAt ?? faker.date.past(),
    updatedAt: overrides.updatedAt ?? faker.date.recent(),
    ...overrides,
  };
}

export function createMockMovieSource(overrides: Partial<MovieSource> = {}): MovieSource {
  const defaultMovie = overrides.movie ?? createMockMovie({ id: overrides.movieId });
  const sourceMetadata = generateSourceMetadata();
  const movieId = overrides.movieId ?? defaultMovie?.id ?? faker.number.int({ min: 1, max: 1000 });
  const hash = overrides.hash ?? sourceMetadata.hash;
  const title = defaultMovie?.title ?? faker.lorem.words(3);

  return {
    id: overrides.id ?? faker.number.int({ min: 1, max: 100000 }),
    movie: defaultMovie,
    movieId,
    hash,
    magnetLink: overrides.magnetLink ?? generateMagnetLink(hash, title),
    url: overrides.url ?? sourceMetadata.url,
    quality: overrides.quality ?? faker.helpers.arrayElement([Quality.FHD, Quality.HD, Quality.SD]),
    size: overrides.size ?? sourceMetadata.size,
    videoCodec:
      overrides.videoCodec ??
      faker.helpers.arrayElement([VideoCodec.X264, VideoCodec.X265, VideoCodec.XVID]),
    broadcasters: overrides.broadcasters ?? sourceMetadata.broadcasters,
    watchers: overrides.watchers ?? sourceMetadata.watchers,
    source: overrides.source ?? faker.helpers.arrayElement(['YTS', 'THERARBG', 'RARBG']),
    sourceType:
      overrides.sourceType ??
      faker.helpers.arrayElement([Source.BLURAY, Source.WEB, Source.HDTV, Source.CAM]),
    file: overrides.file ?? undefined,
    sourceUploadedAt: overrides.sourceUploadedAt ?? sourceMetadata.uploadDate,
    lastStatsCheck: overrides.lastStatsCheck ?? undefined,
    nextStatsCheckAt: overrides.nextStatsCheckAt ?? faker.date.future(),
    createdAt: overrides.createdAt ?? faker.date.past(),
    updatedAt: overrides.updatedAt ?? faker.date.recent(),
    storage: overrides.storage ?? undefined,
    streamingScore: overrides.streamingScore ?? 0,
    ...overrides,
  };
}

export function createMockSourceMetadata(overrides: Partial<SourceMetadata> = {}): SourceMetadata {
  const sourceMetadata = generateSourceMetadata();
  const hash = overrides.hash ?? sourceMetadata.hash;
  const quality =
    overrides.quality ?? faker.helpers.arrayElement([Quality.FHD, Quality.HD, Quality.SD]);

  return {
    audioCodec:
      overrides.audioCodec ??
      faker.helpers.arrayElements([AudioCodec.AAC, AudioCodec.AC3, AudioCodec.DTS], {
        min: 0,
        max: 2,
      }),
    bitrate: overrides.bitrate ?? sourceMetadata.bitrate,
    broadcasters: overrides.broadcasters ?? sourceMetadata.broadcasters,
    hash,
    language:
      overrides.language ??
      faker.helpers.arrayElements([Language.ENGLISH, Language.SPANISH, Language.FRENCH], {
        min: 0,
        max: 2,
      }),
    magnetLink: overrides.magnetLink ?? generateMagnetLink(hash),
    quality,
    score: overrides.score ?? faker.number.float({ min: 0, max: 100, fractionDigits: 1 }),
    size: overrides.size ?? sourceMetadata.size,
    source:
      overrides.source ?? faker.helpers.arrayElement([Source.WEB, Source.BLURAY, Source.HDTV]),
    uploadDate: overrides.uploadDate ?? sourceMetadata.uploadDate,
    url: overrides.url ?? sourceMetadata.url,
    videoCodec:
      overrides.videoCodec ??
      faker.helpers.arrayElement([VideoCodec.X264, VideoCodec.X265, VideoCodec.XVID]),
    watchers: overrides.watchers ?? sourceMetadata.watchers,
    ...overrides,
  };
}

export function createMockMovieSources(count = 2, movieId?: number): MovieSource[] {
  const baseMovieId = movieId ?? faker.number.int({ min: 1, max: 1000 });
  return Array.from({ length: count }, () =>
    createMockMovieSource({
      id: faker.number.int({ min: 1, max: 100000 }),
      movieId: baseMovieId,
    })
  );
}

export function createMockSourceMetadataList(count = 2): SourceMetadata[] {
  return Array.from({ length: count }, () => createMockSourceMetadata());
}
