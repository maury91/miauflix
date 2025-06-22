/**
 * TheRARBG Sanitizer - Smart sanitization for TheRARBG API responses
 *
 * This package provides intelligent sanitization of TheRARBG API responses,
 * replacing copyrighted content with fake data while preserving technical
 * metadata in torrent names.
 */

// Main sanitization functions
export { sanitize, sanitizeImdbData, sanitizeTorrentPost, sanitizeImdbDetail } from './sanitizer';

// Utility functions
export {
  simpleHash,
  generateFakeTitle,
  generateFakeImdbId,
  generateFakePersonName,
  generateSafeInfoHash,
  sanitizeTorrentName,
  generateFakePlot,
  generateFakeUrl,
  shouldUseLegalHash,
  selectLegalHash,
  getLegalHashMetadata,
  getAvailableLegalHashes,
  validateLegalHashAvailability,
} from './utils';

// Types
export type {
  TheRARBGApiResponse,
  TheRARBGImdbData,
  TheRARBGTorrentPost,
  SanitizationOptions,
  TitleMapping,
  LegalTorrentHash,
} from './types';

// Constants and Faker-based generators
export {
  generateFakeMovieTitle,
  generateFakeTVTitle,
  LEGAL_HASHES,
  LEGAL_HASH_LIST,
  DEFAULT_OPTIONS,
  QUALITY_PATTERNS,
  RELEASE_GROUP_PATTERNS,
  YEAR_PATTERN,
  SEPARATORS,
  TECHNICAL_KEYWORDS,
} from './constants';
