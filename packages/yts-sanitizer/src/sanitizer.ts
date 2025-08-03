/**
 * Main YTS sanitization functions
 */

import type {
  YTSMovie,
  YTSSourceMetadata,
  YTSCastMember,
  YTSApiResponse,
  SanitizationOptions,
  YTSMovieDetails,
} from './types';
import { DEFAULT_OPTIONS } from './constants';
import {
  generateTitle,
  generatePersonName,
  generateDescription,
  generateUrl,
  generateTrailerCode,
  generateImdbCode,
  replacementHash,
  getCached,
  initFaker,
} from './utils';

/**
 * Sanitize source metadata
 */
export function sanitizeSourceMetadata(
  sourceMetadata: YTSSourceMetadata,
  options: SanitizationOptions = {},
  seen: Set<string>
): YTSSourceMetadata {
  if (!sourceMetadata || typeof sourceMetadata !== 'object') return sourceMetadata;

  const sanitized = { ...sourceMetadata };
  const { legalHashProbability = DEFAULT_OPTIONS.legalHashProbability, changeDownloadUrlOrigin } =
    options;

  // Sanitize hash
  if (sanitized.hash && typeof sanitized.hash === 'string' && sanitized.hash.length >= 20) {
    const originalHash = sanitized.hash;
    do {
      sanitized.hash = replacementHash(sanitized.hash, legalHashProbability);

      // Update URL to match the new hash if it contains the hash
      if (sanitized.url && sanitized.url.includes(originalHash)) {
        sanitized.url = sanitized.url.replace(originalHash, sanitized.hash);
      }
    } while (seen.has(sanitized.hash));
    seen.add(sanitized.hash);
  }

  if (sanitized.url && changeDownloadUrlOrigin) {
    const originalOrigin = new URL(sanitized.url).origin;
    sanitized.url = sanitized.url.replace(originalOrigin, changeDownloadUrlOrigin);
  }

  return sanitized;
}

/**
 * Sanitize cast member
 */
export function sanitizeCastMember(castMember: YTSCastMember): YTSCastMember {
  if (!castMember || typeof castMember !== 'object') return castMember;

  const sanitized = { ...castMember };

  // Generate fake name
  if (sanitized.name) {
    const nameId = sanitized.imdb_code || sanitized.name;
    sanitized.name = generatePersonName(parseInt(nameId.replace(/\D/g, ''), 10) || 1);
  }

  // Generate fake character name
  if (sanitized.character_name) {
    const charId = `char_${sanitized.imdb_code || sanitized.character_name}`;
    sanitized.character_name = getCached(`character:${charId}`, () => {
      const seedId = parseInt(sanitized.imdb_code?.replace(/\D/g, '') || '1', 10);
      initFaker(seedId);
      return generatePersonName(seedId);
    });
  }

  // Generate fake image URL
  if (sanitized.url_small_image) {
    sanitized.url_small_image = generateUrl(
      `cast_${sanitized.imdb_code}`,
      sanitized.url_small_image
    );
  }

  return sanitized;
}

/**
 * Sanitize a single movie item
 */
export function sanitizeMovie(
  movie: YTSMovie | YTSMovieDetails,
  options: SanitizationOptions = {}
): YTSMovie {
  if (!movie || typeof movie !== 'object') {
    return movie;
  }

  const sanitized = { ...movie };
  const id = `${sanitized.id}`;

  const titleKeys = ['title', 'title_english', 'title_long'] as const;
  for (const key of titleKeys) {
    if (key in sanitized && typeof sanitized[key] === 'string') {
      sanitized[key] = generateTitle(`${key}_${id}`);
    }
  }

  const descriptionKeys = ['description_full', 'summary', 'synopsis'] as const;
  for (const key of descriptionKeys) {
    if (key in sanitized && typeof sanitized[key] === 'string') {
      sanitized[key] = generateDescription(`${key}_${id}`, sanitized[key]);
    }
  }

  // Special case for description_intro because TS is stupid
  if ('description_intro' in sanitized) {
    sanitized.description_intro = generateDescription(
      `desc_intro_${id}`,
      sanitized.description_intro
    );
  }

  // Sanitize URLs
  if (sanitized.url) {
    sanitized.url = generateUrl(`movie_url_${id}`, sanitized.url);
  }

  // Sanitize screenshot images
  const imageKeys = [
    'background_image',
    'background_image_original',
    'small_cover_image',
    'medium_cover_image',
    'large_cover_image',
    'medium_screenshot_image1',
    'medium_screenshot_image2',
    'medium_screenshot_image3',
    'large_screenshot_image1',
    'large_screenshot_image2',
    'large_screenshot_image3',
  ] as const;
  for (const imageKey of imageKeys) {
    if (imageKey in sanitized && typeof (sanitized as YTSMovieDetails)[imageKey] === 'string') {
      (sanitized as YTSMovieDetails)[imageKey] = generateUrl(
        `${imageKey}_${id}`,
        (sanitized as YTSMovieDetails)[imageKey]
      );
    }
  }

  // Sanitize trailer code
  if (sanitized.yt_trailer_code) {
    sanitized.yt_trailer_code = generateTrailerCode(`trailer_${id}`, sanitized.yt_trailer_code);
  }

  // Sanitize IMDB code
  if (sanitized.imdb_code) {
    sanitized.imdb_code = generateImdbCode(`imdb_${id}`, sanitized.imdb_code);
  }

  // Sanitize slug (URL-safe version of title)
  if (sanitized.slug && sanitized.title) {
    sanitized.slug =
      sanitized.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') + `-${sanitized.year || '2024'}`;
  }

  // Sanitize cast
  if ('cast' in sanitized && Array.isArray(sanitized.cast)) {
    sanitized.cast = sanitized.cast.map(sanitizeCastMember);
  }

  // Sanitize source metadatta
  if (sanitized.torrents && Array.isArray(sanitized.torrents)) {
    const seen = new Set<string>();
    sanitized.torrents = sanitized.torrents.map(sourceMetadata =>
      sanitizeSourceMetadata(sourceMetadata, options, seen)
    );
  }

  return sanitized;
}

/**
 * Main sanitization function for YTS API responses
 */
export function sanitize(
  data: YTSApiResponse,
  url?: string,
  options: SanitizationOptions = {}
): YTSApiResponse {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const { maxMovies = DEFAULT_OPTIONS.maxMovies } = options;

  // A data field seems to be present in all the YTS API responses
  if ('data' in data && data.data && typeof data.data === 'object') {
    if ('movies' in data.data && Array.isArray(data.data.movies)) {
      // Movie list response with nested data
      const sanitized = {
        ...data,
        data: {
          ...data.data,
          movies: data.data.movies
            .slice(0, maxMovies)
            .map((movie: YTSMovie) => sanitizeMovie(movie, options)),
        },
      };

      // Limit movie count to prevent too much test data
      if ('movie_count' in data.data && typeof data.data.movie_count === 'number') {
        sanitized.data.movie_count = Math.min(maxMovies, data.data.movie_count);
      }

      return sanitized;
    }

    if ('movie' in data.data && data.data.movie && typeof data.data.movie === 'object') {
      // Single movie response
      return {
        ...data,
        data: {
          ...data.data,
          movie: sanitizeMovie(data.data.movie, options),
        },
      };
    }
  }

  // Default: return data as-is if we don't recognize the format
  return data;
}
