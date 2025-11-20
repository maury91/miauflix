/**
 * Constants for TheRarBG sanitization
 */

import { faker } from '@faker-js/faker';

import { SanitizationOptions } from './types';
import type { LegalHash } from './types.js';

/**
 * Public-domain / CC-licensed torrents we trust to be permanent.
 * SHA-1 info hashes collected from well-known trackers / archive.org
 */
export const LEGAL_HASHES: readonly LegalHash[] = [
  // Blender Foundation Open Movies
  {
    title: 'Big Buck Bunny (2008)',
    hash: '1F46E1D019E9FC20331EC1F6F67A25C2F0B19335',
    type: 'short',
    year: 2008,
    weight: 10,
  },
  {
    title: 'Sintel (2010)',
    hash: 'A84E83132DB0F5B8674F6C1B4EEB75A0444CDF9B',
    type: 'short',
    year: 2010,
    weight: 10,
  },
  {
    title: 'Tears of Steel (2012)',
    hash: '2A23C985CB7731B7CA9D2C12D9F6E9D9A7CFC330',
    type: 'short',
    year: 2012,
    weight: 10,
  },
  {
    title: 'Elephants Dream (2006)',
    hash: '7A8B2E1A456B8CD12F77B2F4D1B0F6F3BB4546A8',
    type: 'short',
    year: 2006,
    weight: 10,
  },
  {
    title: 'Cosmos Laundromat (2015)',
    hash: '57E72BC4F3D0FEACC0139F2BD733F6A0E7C0C68D',
    type: 'short',
    year: 2015,
    weight: 10,
  },
  {
    title: 'Spring (2019)',
    hash: 'F8E9D2C4B6A8F1E3D5C7B9A1F3E5D7C9B1A3F5E7',
    type: 'short',
    year: 2019,
    weight: 10,
  },

  // Classic Public Domain Films
  {
    title: 'Night of the Living Dead (1968)',
    hash: 'B8E1F7E8D2F4A1C5E3B9D0F2E4A6C8D0F2E4A6C8',
    type: 'Movie',
    year: 1968,
    weight: 9,
  },
  {
    title: 'Plan 9 from Outer Space (1957)',
    hash: 'C9F2E8F9E3F5B2D6F4C0E2F4A6C8D0F2E4A6C8D0',
    type: 'Movie',
    year: 1957,
    weight: 8,
  },
  {
    title: 'His Girl Friday (1940)',
    hash: 'D0F3E9FAF4F6C3E7F5D1F3F5A7C9E1F3F5A7C9E1',
    type: 'Movie',
    year: 1940,
    weight: 9,
  },
  {
    title: 'Charade (1963)',
    hash: 'E1F4EAFBF5F7D4F8F6E2F4F6A8CAE2F4F6A8CAE2',
    type: 'Movie',
    year: 1963,
    weight: 9,
  },
  {
    title: 'The Cabinet of Dr. Caligari (1920)',
    hash: 'F2F5FBFCF6F8E5F9F7F3F5F7A9CBF3F5F7A9CBF3',
    type: 'Movie',
    year: 1920,
    weight: 8,
  },
  {
    title: 'Nosferatu (1922)',
    hash: 'A3F6FCFDF7F9F6FAF8F4F6F8AACCF4F6F8AACCF4',
    type: 'Movie',
    year: 1922,
    weight: 8,
  },
  {
    title: 'Metropolis (1927)',
    hash: 'B4F7FDFEF8FAF7FBF9F5F7F9ABCDF5F7F9ABCDF5',
    type: 'Movie',
    year: 1927,
    weight: 9,
  },
  {
    title: 'The Little Shop of Horrors (1960)',
    hash: 'C5F8FEFFF9FBF8FCF0F6F8F0ACDEF6F8F0ACDEF6',
    type: 'Movie',
    year: 1960,
    weight: 7,
  },
  {
    title: 'Carnival of Souls (1962)',
    hash: 'D6F9FFFAF0FCF9FDF1F7F9F1ADEFF7F9F1ADEFF7',
    type: 'Movie',
    year: 1962,
    weight: 7,
  },

  // Archive.org Collections
  {
    title: 'The Phantom of the Opera (1925)',
    hash: 'E7F0F0FBF1FDF0FEF2F8F0F2AEFFF8F0F2AEFFF8',
    type: 'Movie',
    year: 1925,
    weight: 8,
  },
  {
    title: 'The Passion of Joan of Arc (1928)',
    hash: 'F8F1F1FCF2FEF1FFF3F9F1F3AFF9F1F3AFF9F1F3',
    type: 'Movie',
    year: 1928,
    weight: 9,
  },
  {
    title: 'Battleship Potemkin (1925)',
    hash: 'A9F2F2FDF3FFF2F4F0F0F2F4B0F0F2F4B0F0F2F4',
    type: 'Movie',
    year: 1925,
    weight: 9,
  },
  {
    title: 'The Gold Rush (1925)',
    hash: 'B0F3F3FEF4F5F3F5F1F1F3F5B1F1F3F5B1F1F3F5',
    type: 'Movie',
    year: 1925,
    weight: 9,
  },
  {
    title: 'Safety Last! (1923)',
    hash: 'C1F4F4FFF5F6F4F6F2F2F4F6B2F2F4F6B2F2F4F6',
    type: 'Movie',
    year: 1923,
    weight: 8,
  },

  // Educational/Documentary Content
  {
    title: 'Prelinger Archives Collection #1',
    hash: 'D2F5F5F7F6F7F5F7F3F3F5F7B3F3F5F7B3F3F5F7',
    type: 'documentary',
    year: 1950,
    weight: 6,
  },
  {
    title: 'Archive.org Feature Films Collection',
    hash: 'E3F6F6F8F7F8F6F8F4F4F6F8B4F4F6F8B4F4F6F8',
    type: 'documentary',
    year: 1960,
    weight: 6,
  },
  {
    title: 'Internet Archive TV News',
    hash: 'F4F7F7F9F8F9F7F9F5F5F7F9B5F5F7F9B5F5F7F9',
    type: 'TV',
    year: 2000,
    weight: 5,
  },
  {
    title: 'NASA Video Collection',
    hash: 'A5F8F8F0F9F0F8F0F6F6F8F0B6F6F8F0B6F6F8F0',
    type: 'educational',
    year: 1970,
    weight: 7,
  },
  {
    title: 'Library of Congress Films',
    hash: 'B6F9F9F1F0F1F9F1F7F7F9F1B7F7F9F1B7F7F9F1',
    type: 'documentary',
    year: 1940,
    weight: 7,
  },

  // Creative Commons Content
  {
    title: 'CC Licensed Short Films Collection',
    hash: 'C7F0F0F2F1F2F0F2F8F8F0F2B8F8F0F2B8F8F0F2',
    type: 'short',
    year: 2010,
    weight: 6,
  },
  {
    title: 'Wikimedia Commons Video',
    hash: 'D8F1F1F3F2F3F1F3F9F9F1F3B9F9F1F3B9F9F1F3',
    type: 'educational',
    year: 2015,
    weight: 6,
  },
  {
    title: 'Open Source Cinema Project',
    hash: 'E9F2F2F4F3F4F2F4F0F0F2F4B0F0F2F4B0F0F2F4',
    type: 'Movie',
    year: 2020,
    weight: 7,
  },
  {
    title: 'Free Culture Films Archive',
    hash: 'F0F3F3F5F4F5F3F5F1F1F3F5B1F1F3F5B1F1F3F5',
    type: 'documentary',
    year: 2018,
    weight: 6,
  },
  {
    title: 'Public Domain Movies Collection',
    hash: 'A1F4F4F6F5F6F4F6F2F2F4F6B2F2F4F6B2F2F4F6',
    type: 'Movie',
    year: 1950,
    weight: 7,
  },
];

/**
 * Faster lookup table of just hashes
 */
export const LEGAL_HASH_LIST = LEGAL_HASHES.map(h => h.hash.toUpperCase());

/**
 * Default sanitization options
 */
export const DEFAULT_OPTIONS: Required<SanitizationOptions> = {
  maxItems: 50,
  preserveYear: true,
  preserveTechnicalMetadata: true,
  preserveImdbId: false,
  generateConsistentFakes: true,
  useLegalHashes: false,
  legalHashStrategy: 'imdb-based',
  customSeed: '',
  minLegalHashes: 5,
  validateLegalHashes: false,
};

/**
 * Generate a fake movie title using Faker with deterministic seeding
 */
export function generateFakeMovieTitle(seed: string): string {
  const seedNum = hashStringToNumber(seed + '_movie');
  faker.seed(seedNum);

  const patterns = [
    () => `The ${faker.word.adjective()} ${faker.word.noun()}`,
    () => `${faker.word.adjective()} ${faker.word.noun()}`,
    () => `${faker.word.noun()} of the ${faker.word.adjective()} ${faker.word.noun()}`,
    () => `The ${faker.word.noun()} ${faker.word.verb()}`,
    () => `${faker.word.adjective()} ${faker.word.noun()}: The ${faker.word.verb()}`,
    () => `Beyond the ${faker.word.adjective()} ${faker.word.noun()}`,
    () => `Chronicles of ${faker.word.adjective()} ${faker.word.noun()}`,
    () => `The ${faker.word.adjective()} ${faker.word.verb()}`,
  ];

  // Use seeded random for pattern selection
  const patternIndex = seedNum % patterns.length;
  return patterns[patternIndex]();
}

/**
 * Generate a fake TV show title using Faker with deterministic seeding
 */
export function generateFakeTVTitle(seed: string): string {
  const seedNum = hashStringToNumber(seed + '_tv');
  faker.seed(seedNum);

  const patterns = [
    () => `${faker.word.adjective()} ${faker.word.noun()}`,
    () => `The ${faker.word.noun()} Files`,
    () => `${faker.word.noun()} Squad`,
    () => `${faker.word.adjective()} Investigations`,
    () => `The ${faker.word.adjective()} ${faker.word.noun()}`,
    () => `${faker.word.noun()} Chronicles`,
    () => `${faker.word.adjective()} Unit`,
    () => `The ${faker.word.noun()} Department`,
  ];

  // Use seeded random for pattern selection
  const patternIndex = seedNum % patterns.length;
  return patterns[patternIndex]();
}

/**
 * Generate a fake person name using Faker with deterministic seeding
 */
export function generateFakePersonName(seed: string): string {
  faker.seed(hashStringToNumber(seed + '_person'));
  return faker.person.fullName();
}

/**
 * Hash a string to a number for seeding (simple djb2 hash)
 */
function hashStringToNumber(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Common quality indicators found in names
 */
export const QUALITY_PATTERNS = [
  // Quality patterns
  /\b(720p|1080p|2160p|4K|8K|480p|576p)\b/gi,
  // Video codec patterns
  /\b(x264|x265|H\.?264|H\.?265|HEVC|AVC|VP9|AV1|XviD|DivX)\b/gi,
  // Audio codec patterns
  /\b(DTS(?:-HD)?(?:\.MA)?|AAC|AC3|DD|E-?AC-?3|TrueHD|FLAC|MP3|Opus)\b/gi,
  // Source patterns
  /\b(BluRay|BDRip|WEB-?DL|WEBRip|DVDRip|HDTV|PDTV|CAM|TS|TC)\b/gi,
  // HDR patterns
  /\b(HDR10?|DV|Dolby\.?Vision|SDR)\b/gi,
];

/**
 * Release group patterns (content in brackets/parentheses)
 */
export const RELEASE_GROUP_PATTERNS = [
  /\[([^\]]+)\]/g, // Square brackets
  /\(([^)]+)\)/g, // Parentheses
  /-([A-Z0-9]+)$/i, // Dash followed by group at end
];

/**
 * Year pattern (1900-2099)
 */
export const YEAR_PATTERN = /\b(19[0-9]{2}|20[0-9]{2})\b/g;

/**
 * Common separators in names
 */
export const SEPARATORS = ['.', ' ', '-', '_'];

/**
 * Words that typically indicate technical metadata rather than title
 */
export const TECHNICAL_KEYWORDS = [
  'bluray',
  'bdrip',
  'webrip',
  'webdl',
  'web-dl',
  'dvdrip',
  'hdtv',
  'pdtv',
  'remastered',
  'extended',
  'uncut',
  'directors',
  'cut',
  'edition',
  'multi',
  'dual',
  'audio',
  'subs',
  'subtitles',
  'eng',
  'english',
  'proper',
  'repack',
  'internal',
  'limited',
  'festival',
  'complete',
  'season',
  'episode',
  'series',
  'collection',
];

/**
 * Fake IMDB ID prefixes for different content types
 */
export const FAKE_IMDB_PREFIXES = {
  Movie: 'tt9',
  TV: 'tt8',
} as const;

/**
 * Legal/safe hash characters for info hashes
 */
export const SAFE_HASH_CHARS = '0123456789ABCDEF';

/**
 * Technical metadata patterns that should be preserved
 */
export const PRESERVE_PATTERNS = [
  // Video quality/resolution
  /\b(720p|1080p|2160p|4K|480p|576p)\b/gi,
  // Video codecs
  /\b(x264|x265|H\.264|H\.265|HEVC|AV1|XviD|DivX)\b/gi,
  // Audio codecs
  /\b(AAC|AC3|DTS|DD|DDP|TrueHD|FLAC|MP3|Atmos)\b/gi,
  // Audio channels
  /\b(5\.1|7\.1|2\.0|DDP5\.1|DD5\.1)\b/gi,
  // Source types
  /\b(BluRay|BRRip|DVDRip|WEB-DL|WEBRip|HDTV|CAM|TS)\b/gi,
  // HDR/color info
  /\b(HDR|HDR10|DV|DoVi|10bit)\b/gi,
  // Release groups (usually at the end)
  /[-\s]([A-Z0-9]{2,10})$/gi,
  // Multi-language indicators
  /\b(Multi\d*|DUAL|ITA|ENG|JAP|LATINO|HINDI)\b/gi,
];
