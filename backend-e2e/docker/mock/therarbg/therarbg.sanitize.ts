/**
 * therarbg.sanitize.ts
 * TheRARBG Mock Data Sanitizer - Runtime sanitization for TheRARBG API endpoints
 *
 * This file uses the shared @miauflix/therarbg-sanitizer library for consistency
 * across all projects.
 */

import { sanitize as sanitizeFromPkg } from '@miauflix/therarbg-sanitizer';

/**
 * Main sanitization function for TheRARBG API responses
 * Now delegates to the shared library
 */
export function sanitize(data: any, url?: string): any {
  console.log('🔧 TheRARBG Sanitizer called with URL:', url);
  console.log('🔧 Input data type:', typeof data);
  console.log('🔧 Input data keys:', data && typeof data === 'object' ? Object.keys(data) : 'N/A');

  const sanitized = sanitizeFromPkg(data, url, {
    maxItems: 50,
    useLegalHashes: true,
    legalHashStrategy: 'imdb-based',
    preserveTechnicalMetadata: true,
    preserveImdbId: true,
  });

  console.log('🔧 Sanitization complete');
  return sanitized;
}
