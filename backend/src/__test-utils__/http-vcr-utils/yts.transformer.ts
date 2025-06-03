/**
 * Deterministically transforms YTS responses using the shared sanitization library.
 * This ensures that:
 * 1. Movie titles are replaced with appropriate alternatives
 * 2. URLs pointing to torrent downloads are scrambled
 * 3. Torrent hashes are modified
 * 4. Other sensitive data is altered
 *
 * This file now uses the shared @miauflix/yts-sanitizer library for consistency
 * across all projects.
 */

import { sanitize } from '@miauflix/yts-sanitizer';

export function transformYtsData(data: unknown): unknown {
  return sanitize(data, undefined, {
    maxMovies: 50,
    useLegalHashes: true,
    legalHashProbability: 0.6,
  });
}
