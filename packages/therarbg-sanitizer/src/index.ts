/**
 * TheRARBG Sanitizer - Smart sanitization for TheRARBG API responses
 *
 * This package provides intelligent sanitization of TheRARBG API responses,
 * replacing copyrighted content with fake data while preserving technical
 * metadata in names.
 */

// Main sanitization functions
export { sanitize, sanitizeImdbData, sanitizeImdbDetail, sanitizePost } from './sanitizer';

// Utility functions
export {
  generateFakeImdbId,
  generateFakePersonName,
  generateFakePlot,
  generateFakeTitle,
  generateFakeUrl,
  generateSafeInfoHash,
  getAvailableLegalHashes,
  getLegalHashMetadata,
  sanitizeName,
  selectLegalHash,
  shouldUseLegalHash,
  simpleHash,
  validateLegalHashAvailability,
} from './utils';

// Types
export type {
  LegalHash,
  SanitizationOptions,
  TheRARBGApiResponse,
  TheRARBGImdbData,
  TheRARBGPost,
  TitleMapping,
} from './types';

// Constants and Faker-based generators
export {
  DEFAULT_OPTIONS,
  generateFakeMovieTitle,
  generateFakeTVTitle,
  LEGAL_HASH_LIST,
  LEGAL_HASHES,
  QUALITY_PATTERNS,
  RELEASE_GROUP_PATTERNS,
  SEPARATORS,
  TECHNICAL_KEYWORDS,
  YEAR_PATTERN,
} from './constants';
