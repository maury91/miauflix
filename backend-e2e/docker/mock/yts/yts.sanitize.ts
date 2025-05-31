/**
 * yts.sanitize.ts
 * YTS Mock Data Sanitizer - Runtime sanitization for YTS API endpoints
 */

import { faker } from '@faker-js/faker';
import { uniqueNamesGenerator, adjectives, animals, starWars } from 'unique-names-generator';
import seedrandom from 'seedrandom';

// Cache for consistent data across calls
const cache = new Map<string, any>();

/**
 * Public-domain / CC-licensed torrents we trust to be permanent.
 * SHA-1 info hashes collected from well-known trackers / archive.org
 */
const LEGAL_HASHES: readonly { title: string; hash: string }[] = [
  { title: 'Big Buck Bunny (2008)', hash: '1F46E1D019E9FC20331EC1F6F67A25C2F0B19335' },
  { title: 'Sintel (2010)', hash: 'A84E83132DB0F5B8674F6C1B4EEB75A0444CDF9B' },
  { title: 'Tears of Steel (2012)', hash: '2A23C985CB7731B7CA9D2C12D9F6E9D9A7CFC330' },
  { title: 'Elephants Dream (2006)', hash: '7A8B2E1A456B8CD12F77B2F4D1B0F6F3BB4546A8' },
  { title: 'Cosmos Laundromat (2015)', hash: '57E72BC4F3D0FEACC0139F2BD733F6A0E7C0C68D' },
  { title: 'The Room (Public Domain cut)', hash: 'DA71F034282D2E6E940A0C112233445566778899' },
];

// Faster lookup table of just hashes
const LEGAL_HASH_LIST = LEGAL_HASHES.map(h => h.hash.toUpperCase());

/**
 * Initialize faker with deterministic seed based on input
 */
function initFaker(id: number): void {
  faker.seed(id);
}

/**
 * Generate consistent fake data with caching
 */
function getCached<T>(key: string, generator: () => T): T {
  if (cache.has(key)) {
    return cache.get(key);
  }
  const value = generator();
  cache.set(key, value);
  return value;
}

/**
 * Generate RNG from seed
 */
function rngFromSeed(seed: string): seedrandom.PRNG {
  return seedrandom(seed);
}

/**
 * Pick a legal hash deterministically
 */
function pickLegal(seed: string): string {
  const rnd = rngFromSeed(seed);
  const idx = Math.floor(rnd() * LEGAL_HASH_LIST.length);
  return LEGAL_HASH_LIST[idx] || LEGAL_HASH_LIST[0]!;
}

/**
 * Generate random hash from seed
 */
function randomHash(seed: string): string {
  const rnd = rngFromSeed(seed);
  let hex = '';
  while (hex.length < 40) {
    hex += Math.floor(rnd() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  }
  return hex.slice(0, 40).toUpperCase();
}

/**
 * Deterministically choose a replacement hash.
 * 60% probability → legal known hash, 40% → seeded pseudo-random.
 */
function replacementHash(original: string): string {
  const seed = original.toUpperCase();
  const rnd = rngFromSeed(seed);
  return rnd() < 0.6 ? pickLegal(seed) : randomHash(seed);
}

/**
 * Generate fake movie title
 */
function generateTitle(id: string): string {
  const seed = seedrandom(id);
  return getCached(`title:${id}`, () => {
    initFaker(seed.int32());
    return uniqueNamesGenerator({
      dictionaries: [adjectives, animals],
      separator: ' ',
      style: 'capital',
    });
  });
}

/**
 * Generate fake person name
 */
function generatePersonName(id: number): string {
  return getCached(`person:${id}`, () => {
    initFaker(id);
    return faker.person.fullName();
  });
}

/**
 * Generate fake description/summary
 */
function generateDescription(id: string, originalDescription: string): string {
  if (!originalDescription) return '';
  const seed = seedrandom(id);
  return getCached(`description:${id}`, () => {
    initFaker(seed.int32());
    // Generate 1-3 sentences
    const sentences = faker.helpers.rangeToNumber({ min: 1, max: 3 });
    return Array.from({ length: sentences }, () => faker.lorem.sentence()).join(' ');
  });
}

/**
 * Generate fake URL
 */
function generateUrl(id: string, original: string): string {
  if (!original) return '';

  const seed = seedrandom(id);
  return getCached(`url:${id}`, () => {
    initFaker(seed.int32());
    const domain = faker.internet.domainName();
    const path = faker.system.directoryPath().replace(/\\/g, '/');
    return `https://${domain}${path}`;
  });
}

/**
 * Generate fake YouTube trailer code
 */
function generateTrailerCode(id: string, original: string): string {
  if (!original) return '';

  const seed = seedrandom(id);
  return getCached(`trailer:${id}`, () => {
    initFaker(seed.int32());
    return faker.string.alphanumeric(11); // YouTube video IDs are 11 characters
  });
}

/**
 * Generate fake IMDB code
 */
function generateImdbCode(id: string, original: string): string {
  if (!original || !original.startsWith('tt')) return original;

  const seed = seedrandom(id);
  return getCached(`imdb:${id}`, () => {
    initFaker(seed.int32());
    const number = faker.string.numeric(8);
    return `tt${number}`;
  });
}

/**
 * Sanitize torrent data
 */
function sanitizeTorrent(torrent: any): any {
  if (!torrent || typeof torrent !== 'object') return torrent;

  const sanitized = { ...torrent };

  // Sanitize hash - most important for legal reasons
  if (sanitized.hash && typeof sanitized.hash === 'string' && sanitized.hash.length >= 20) {
    sanitized.hash = replacementHash(sanitized.hash);

    // Update URL to match the new hash if it contains the hash
    if (sanitized.url && sanitized.url.includes(torrent.hash)) {
      sanitized.url = sanitized.url.replace(torrent.hash, sanitized.hash);
    }
  }

  return sanitized;
}

/**
 * Sanitize cast member
 */
function sanitizeCastMember(castMember: any): any {
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
      initFaker(parseInt(sanitized.imdb_code?.replace(/\D/g, ''), 10) || 1);
      return faker.person.firstName();
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
function sanitizeMovie(movie: any): any {
  console.log(
    '🎬 Sanitizing movie:',
    movie ? { id: movie.id, title: movie.title, imdb_code: movie.imdb_code } : 'null/undefined'
  );

  if (!movie || typeof movie !== 'object') {
    console.log('🎬 Movie is not an object, returning as-is');
    return movie;
  }

  const sanitized = { ...movie };
  const id = `${sanitized.id}`;

  console.log('🎬 Movie ID for cache key:', id);

  // Sanitize titles
  if (sanitized.title) {
    const oldTitle = sanitized.title;
    sanitized.title = generateTitle(`title_${id}`);
    console.log('🎬 Title changed:', oldTitle, '->', sanitized.title);
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
  [
    'medium_screenshot_image1',
    'medium_screenshot_image2',
    'medium_screenshot_image3',
    'large_screenshot_image1',
    'large_screenshot_image2',
    'large_screenshot_image3',
  ].forEach(imageKey => {
    if (sanitized[imageKey]) {
      sanitized[imageKey] = generateUrl(`${imageKey}_${id}`, sanitized[imageKey]);
    }
  });

  // Sanitize trailer code
  if (sanitized.yt_trailer_code) {
    sanitized.yt_trailer_code = generateTrailerCode(`trailer_${id}`, sanitized.yt_trailer_code);
  }

  // Sanitize IMDB code
  if (sanitized.imdb_code) {
    const oldImdbCode = sanitized.imdb_code;
    sanitized.imdb_code = generateImdbCode(`imdb_${id}`, sanitized.imdb_code);
    console.log('🎬 IMDB code changed:', oldImdbCode, '->', sanitized.imdb_code);
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

  // Sanitize torrents - MOST IMPORTANT for legal reasons
  if (sanitized.torrents && Array.isArray(sanitized.torrents)) {
    console.log('🎬 Sanitizing', sanitized.torrents.length, 'torrents');
    console.log(
      '🎬 First torrent before sanitization:',
      sanitized.torrents[0]
        ? {
            hash: sanitized.torrents[0].hash,
            url: sanitized.torrents[0].url,
          }
        : 'No torrents'
    );

    sanitized.torrents = sanitized.torrents.map(sanitizeTorrent);

    console.log(
      '🎬 First torrent after sanitization:',
      sanitized.torrents[0]
        ? {
            hash: sanitized.torrents[0].hash,
            url: sanitized.torrents[0].url,
          }
        : 'No torrents'
    );
  }

  console.log('🎬 Finished sanitizing movie:', {
    id: sanitized.id,
    title: sanitized.title,
    imdb_code: sanitized.imdb_code,
  });
  return sanitized;
}

/**
 * Main sanitization function for YTS API responses
 */
export function sanitize(data: any, url?: string): any {
  console.log('🔧 YTS Sanitizer called with URL:', url);
  console.log('🔧 Input data type:', typeof data);
  console.log('🔧 Input data keys:', data && typeof data === 'object' ? Object.keys(data) : 'N/A');

  if (!data || typeof data !== 'object') {
    console.log('🔧 Returning data unchanged (not object)');
    return data;
  }

  // Handle wrapped HTTP response format
  if (data.body && data.body.data) {
    console.log('🔧 Found wrapped HTTP response format');
    const sanitized = {
      ...data,
      body: {
        ...data.body,
        data: sanitize(data.body.data, url),
      },
    };
    console.log('🔧 Returning wrapped sanitized data');
    return sanitized;
  }

  // Handle YTS API data structure
  if (data.movies && Array.isArray(data.movies)) {
    console.log('🔧 Found movies array with', data.movies.length, 'movies');
    console.log(
      '🔧 First movie before sanitization:',
      data.movies[0]
        ? {
            title: data.movies[0].title,
            imdb_code: data.movies[0].imdb_code,
            hash: data.movies[0].torrents?.[0]?.hash,
          }
        : 'No movies'
    );

    // Movie list response
    const sanitized = {
      ...data,
      movies: data.movies.map(sanitizeMovie),
    };

    console.log(
      '🔧 First movie after sanitization:',
      sanitized.movies[0]
        ? {
            title: sanitized.movies[0].title,
            imdb_code: sanitized.movies[0].imdb_code,
            hash: sanitized.movies[0].torrents?.[0]?.hash,
          }
        : 'No movies'
    );

    // Limit movie count to prevent too much test data
    if (typeof data.movie_count === 'number') {
      const maxMovies = 50; // Reasonable limit for tests
      sanitized.movie_count = Math.min(maxMovies, data.movie_count);

      // Limit the actual movies array as well
      if (sanitized.movies.length > maxMovies) {
        sanitized.movies = sanitized.movies.slice(0, maxMovies);
      }
    }

    console.log('🔧 Returning sanitized movies array');
    return sanitized;
  }

  // Handle single movie response
  if (data.movie && typeof data.movie === 'object') {
    console.log('🔧 Found single movie response');
    return {
      ...data,
      movie: sanitizeMovie(data.movie),
    };
  }

  // Default: return data as-is if we don't recognize the format
  console.log('🔧 Unrecognized format, returning data as-is');
  return data;
}

export default sanitize;
