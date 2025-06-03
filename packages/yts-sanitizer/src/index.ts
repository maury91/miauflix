/**
 * @miauflix/yts-sanitizer
 *
 * A shared library for sanitizing YTS API data across Miauflix projects.
 * Provides consistent fake data generation for testing and development.
 */

// Main sanitization functions
export { sanitize, sanitizeMovie, sanitizeTorrent, sanitizeCastMember } from './sanitizer.js';

// Utility functions that might be useful externally
export {
  generateTitle,
  generatePersonName,
  generateDescription,
  generateUrl,
  generateTrailerCode,
  generateImdbCode,
  clearCache,
} from './utils.js';

// Types
export type {
  YTSMovie,
  YTSTorrent,
  YTSCastMember,
  YTSMovieListResponse,
  YTSMovieDetailsResponse,
  YTSWrappedResponse,
  YTSApiResponse,
  LegalTorrentHash,
  SanitizationOptions,
} from './types.js';

// Constants
export { LEGAL_HASHES, LEGAL_HASH_LIST, DEFAULT_OPTIONS } from './constants.js';
