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
import type { Genre } from '@entities/genre.entity';
import type { Movie } from '@entities/movie.entity';
import type { MovieTranslation } from '@entities/movie.entity';
import type { MovieSource } from '@entities/movie-source.entity';

function createMockGenre(overrides: Partial<Genre> = {}): Genre {
  return {
    id: overrides.id ?? faker.number.int({ min: 1, max: 10000 }),
    translations: overrides.translations ?? [],
    ...overrides,
  };
}

function createMockTranslation(overrides: Partial<MovieTranslation> = {}): MovieTranslation {
  const movieMetadata = generateMovieMetadata();
  const movieId = overrides.movieId ?? faker.number.int({ min: 1, max: 1000 });

  return {
    id: overrides.id ?? faker.number.int({ min: 1, max: 10000 }),
    language: overrides.language ?? faker.helpers.arrayElement(['en', 'es', 'fr', 'de', 'it']),
    movie: overrides.movie ?? createMockMovie({ id: movieId }),
    movieId,
    overview: overrides.overview ?? movieMetadata.overview,
    title: overrides.title ?? movieMetadata.title,
    tagline: overrides.tagline ?? movieMetadata.tagline,
    createdAt: overrides.createdAt ?? faker.date.past(),
    updatedAt: overrides.updatedAt ?? faker.date.recent(),
    ...overrides,
  };
}

export function createMockMovie(overrides: Partial<Movie> = {}): Movie {
  const genres = overrides.genres ?? [createMockGenre()];
  const translations = overrides.translations ?? [];
  const movieMetadata = generateMovieMetadata();

  return {
    id: overrides.id ?? faker.number.int({ min: 1, max: 100000 }),
    tmdbId: overrides.tmdbId ?? faker.number.int({ min: 1, max: 1000000 }),
    imdbId:
      typeof overrides.imdbId === 'string' && overrides.imdbId
        ? overrides.imdbId
        : generateImdbId(),
    title: overrides.title ?? movieMetadata.title,
    overview: overrides.overview ?? movieMetadata.overview,
    runtime: overrides.runtime ?? movieMetadata.runtime,
    tagline: overrides.tagline ?? movieMetadata.tagline,
    trailer: overrides.trailer ?? (faker.datatype.boolean() ? faker.string.alphanumeric(11) : ''),
    rating: overrides.rating ?? movieMetadata.rating,
    popularity: overrides.popularity ?? movieMetadata.popularity,
    releaseDate: overrides.releaseDate ?? movieMetadata.releaseDate,
    genres,
    translations,
    poster: overrides.poster ?? movieMetadata.poster,
    backdrop: overrides.backdrop ?? movieMetadata.backdrop,
    logo: overrides.logo ?? movieMetadata.logo,
    contentDirectoriesSearched: overrides.contentDirectoriesSearched ?? [],
    sources: overrides.sources ?? [],
    createdAt: overrides.createdAt ?? faker.date.past(),
    updatedAt: overrides.updatedAt ?? faker.date.recent(),
    nextSourceSearchAt: overrides.nextSourceSearchAt ?? faker.date.future(),
    ...overrides,
  };
}

export function createMockGenres(count = 2): Genre[] {
  return Array.from({ length: count }, () =>
    createMockGenre({
      id: faker.number.int({ min: 1, max: 10000 }),
    })
  );
}

export function createMockTranslations(count = 1, movieId?: number): MovieTranslation[] {
  const baseMovieId = movieId ?? faker.number.int({ min: 1, max: 1000 });
  return Array.from({ length: count }, () =>
    createMockTranslation({
      id: faker.number.int({ min: 1, max: 10000 }),
      movieId: baseMovieId,
    })
  );
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
    resolution:
      overrides.resolution ??
      (overrides.quality === Quality.FHD ? 1080 : overrides.quality === Quality.HD ? 720 : 480),
    size: overrides.size ?? sourceMetadata.size,
    videoCodec: overrides.videoCodec ?? faker.helpers.arrayElement(['X264', 'X265', 'XVID']),
    broadcasters: overrides.broadcasters ?? sourceMetadata.broadcasters,
    watchers: overrides.watchers ?? sourceMetadata.watchers,
    source: overrides.source ?? faker.helpers.arrayElement(['YTS', 'THERARBG', 'RARBG']),
    sourceType:
      overrides.sourceType ?? faker.helpers.arrayElement(['BLURAY', 'WEB', 'HDTV', 'CAM']),
    file: overrides.file ?? undefined,
    sourceUploadedAt: overrides.sourceUploadedAt ?? sourceMetadata.uploadDate,
    lastStatsCheck: overrides.lastStatsCheck ?? undefined,
    nextStatsCheckAt: overrides.nextStatsCheckAt ?? faker.date.future(),
    createdAt: overrides.createdAt ?? faker.date.past(),
    updatedAt: overrides.updatedAt ?? faker.date.recent(),
    storage: overrides.storage ?? undefined,
    ...overrides,
  };
}

export function createMockSourceMetadata(overrides: Partial<SourceMetadata> = {}): SourceMetadata {
  const sourceMetadata = generateSourceMetadata();
  const hash = overrides.hash ?? sourceMetadata.hash;
  const quality =
    overrides.quality ?? faker.helpers.arrayElement([Quality.FHD, Quality.HD, Quality.SD]);

  // Generate resolution based on quality
  const getResolutionForQuality = (q: Quality) => {
    switch (q) {
      case Quality.FHD:
        return { width: 1920, height: 1080, label: 'FHD' };
      case Quality.HD:
        return { width: 1280, height: 720, label: 'HD' };
      case Quality.SD:
        return { width: 854, height: 480, label: 'SD' };
      default:
        return { width: 1920, height: 1080, label: 'FHD' };
    }
  };

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
    resolution: overrides.resolution ?? getResolutionForQuality(quality),
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
