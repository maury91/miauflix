/**
 * Deterministically transforms TheRARBG responses using the shared sanitization library.
 * This ensures that:
 * 1. Movie/TV titles are replaced with fictional alternatives
 * 2. Hashes are replaced with known hashes or fake hashes
 * 3. Personal information (names, descriptions) is sanitized
 * 4. File names and technical metadata are preserved
 * 5. IMDB IDs are replaced with fictional ones
 *
 * This file uses the shared @miauflix/therarbg-sanitizer library for consistency
 * across all projects.
 */

import { sanitize } from '@miauflix/therarbg-sanitizer';

export function transformTheRarbgData(data: unknown): unknown {
  return sanitize(data, undefined, {
    useLegalHashes: true,
    preserveTechnicalMetadata: true,
    preserveImdbId: true,
    maxItems: 20,
    legalHashStrategy: 'imdb-based',
  });
}
