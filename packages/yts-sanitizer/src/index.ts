/**
 * @miauflix/yts-sanitizer
 *
 * A shared library for sanitizing YTS API data across Miauflix projects.
 * Provides consistent fake data generation for testing and development.
 */

// Main sanitization functions
export {
  sanitize,
  sanitizeCastMember,
  sanitizeMovie,
  sanitizeSourceMetadata,
} from './sanitizer.js';

// Utility functions that might be useful externally
export {
  clearCache,
  generateDescription,
  generateImdbCode,
  generatePersonName,
  generateTitle,
  generateTrailerCode,
  generateUrl,
} from './utils.js';

// Types
export type {
  LegalHash,
  SanitizationOptions,
  YTSApiResponse,
  YTSCastMember,
  YTSMovie,
  YTSMovieDetailsResponse,
  YTSMovieListResponse,
  YTSSourceMetadata,
  YTSWrappedResponse,
} from './types.js';

// Constants
export { DEFAULT_OPTIONS, LEGAL_HASH_LIST, LEGAL_HASHES } from './constants.js';
