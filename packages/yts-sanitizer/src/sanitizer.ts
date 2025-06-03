/**
 * Main YTS sanitization functions
 */

import type {
  YTSMovie,
  YTSTorrent,
  YTSCastMember,
  YTSApiResponse,
  SanitizationOptions,
} from './types.js';
import { DEFAULT_OPTIONS } from './constants.js';
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
} from './utils.js';

/**
 * Sanitize torrent data
 */
export function sanitizeTorrent(
  torrent: YTSTorrent,
  options: SanitizationOptions = {}
): YTSTorrent {
  if (!torrent || typeof torrent !== 'object') return torrent;

  const sanitized = { ...torrent };
  const { legalHashProbability = DEFAULT_OPTIONS.legalHashProbability } = options;

  // Sanitize hash
  if (sanitized.hash && typeof sanitized.hash === 'string' && sanitized.hash.length >= 20) {
    const originalHash = sanitized.hash;
    sanitized.hash = replacementHash(sanitized.hash, legalHashProbability);

    // Update URL to match the new hash if it contains the hash
    if (sanitized.url && sanitized.url.includes(originalHash)) {
      sanitized.url = sanitized.url.replace(originalHash, sanitized.hash);
    }
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
export function sanitizeMovie(movie: YTSMovie, options: SanitizationOptions = {}): YTSMovie {
  if (!movie || typeof movie !== 'object') {
    return movie;
  }

  const sanitized = { ...movie };
  const id = `${sanitized.id}`;

  // Sanitize titles
  if (sanitized.title) {
    sanitized.title = generateTitle(`title_${id}`);
  }
  if (sanitized.title_english) {
    sanitized.title_english = generateTitle(`title_english_${id}`);
  }
  if (sanitized.title_long) {
    sanitized.title_long = generateTitle(`title_long_${id}`);
  }

  // Sanitize descriptions
  if (sanitized.description_intro) {
    sanitized.description_intro = generateDescription(
      `desc_intro_${id}`,
      sanitized.description_intro
    );
  }
  if (sanitized.description_full) {
    sanitized.description_full = generateDescription(`desc_full_${id}`, sanitized.description_full);
  }
  if (sanitized.summary) {
    sanitized.summary = generateDescription(`summary_${id}`, sanitized.summary);
  }
  if (sanitized.synopsis) {
    sanitized.synopsis = generateDescription(`synopsis_${id}`, sanitized.synopsis);
  }

  // Sanitize URLs
  if (sanitized.url) {
    sanitized.url = generateUrl(`movie_url_${id}`, sanitized.url);
  }
  if (sanitized.background_image) {
    sanitized.background_image = generateUrl(`bg_${id}`, sanitized.background_image);
  }
  if (sanitized.background_image_original) {
    sanitized.background_image_original = generateUrl(
      `bg_orig_${id}`,
      sanitized.background_image_original
    );
  }
  if (sanitized.small_cover_image) {
    sanitized.small_cover_image = generateUrl(`cover_small_${id}`, sanitized.small_cover_image);
  }
  if (sanitized.medium_cover_image) {
    sanitized.medium_cover_image = generateUrl(`cover_medium_${id}`, sanitized.medium_cover_image);
  }
  if (sanitized.large_cover_image) {
    sanitized.large_cover_image = generateUrl(`cover_large_${id}`, sanitized.large_cover_image);
  }

  // Sanitize screenshot images
  const imageKeys = [
    'medium_screenshot_image1',
    'medium_screenshot_image2',
    'medium_screenshot_image3',
    'large_screenshot_image1',
    'large_screenshot_image2',
    'large_screenshot_image3',
  ] as const;

  imageKeys.forEach(imageKey => {
    if (sanitized[imageKey]) {
      sanitized[imageKey] = generateUrl(`${imageKey}_${id}`, sanitized[imageKey] as string);
    }
  });

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
  if (sanitized.cast && Array.isArray(sanitized.cast)) {
    sanitized.cast = sanitized.cast.map(sanitizeCastMember);
  }

  // Sanitize torrents
  if (sanitized.torrents && Array.isArray(sanitized.torrents)) {
    sanitized.torrents = sanitized.torrents.map(torrent => sanitizeTorrent(torrent, options));
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

  // Handle wrapped HTTP response format
  if ('body' in data && data.body && typeof data.body === 'object' && 'data' in data.body) {
    const sanitized = {
      ...data,
      body: {
        ...data.body,
        data: sanitize(data.body.data, url, options),
      },
    };
    return sanitized;
  }

  // Handle YTS API data structure with nested data property
  if (
    'data' in data &&
    data.data &&
    typeof data.data === 'object' &&
    'movies' in data.data &&
    Array.isArray(data.data.movies)
  ) {
    // Movie list response with nested data
    const sanitized = {
      ...data,
      data: {
        ...data.data,
        movies: data.data.movies.map((movie: YTSMovie) => sanitizeMovie(movie, options)),
      },
    };

    // Limit movie count to prevent too much test data
    if ('movie_count' in data.data && typeof data.data.movie_count === 'number') {
      sanitized.data.movie_count = Math.min(maxMovies, data.data.movie_count);

      // Limit the actual movies array as well
      if (sanitized.data.movies.length > maxMovies) {
        sanitized.data.movies = sanitized.data.movies.slice(0, maxMovies);
      }
    }

    return sanitized;
  }

  // Handle YTS API data structure
  if ('movies' in data && Array.isArray(data.movies)) {
    // Movie list response
    const sanitized = {
      ...data,
      movies: data.movies.map((movie: YTSMovie) => sanitizeMovie(movie, options)),
    };

    // Limit movie count to prevent too much test data
    if ('movie_count' in data && typeof data.movie_count === 'number') {
      sanitized.movie_count = Math.min(maxMovies, data.movie_count);

      // Limit the actual movies array as well
      if (sanitized.movies.length > maxMovies) {
        sanitized.movies = sanitized.movies.slice(0, maxMovies);
      }
    }

    return sanitized;
  }

  // Handle single movie response
  if ('movie' in data && data.movie && typeof data.movie === 'object') {
    return {
      ...data,
      movie: sanitizeMovie(data.movie, options),
    };
  }

  // Default: return data as-is if we don't recognize the format
  return data;
}
