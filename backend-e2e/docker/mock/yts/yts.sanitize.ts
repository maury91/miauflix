/**
 * yts.sanitize.ts
 * YTS Mock Data Sanitizer - Runtime sanitization for YTS API endpoints
 *
 * This file now uses the shared @miauflix/yts-sanitizer library for consistency
 * across all projects.
 */

import { sanitize as sanitizeYts } from '@miauflix/yts-sanitizer';

/**
 * Main sanitization function for YTS API responses
 * Now delegates to the shared library
 */
export function sanitize(data: any, url?: string): any {
  console.log('🔧 YTS Sanitizer called with URL:', url);
  console.log('🔧 Input data type:', typeof data);
  console.log('🔧 Input data keys:', data && typeof data === 'object' ? Object.keys(data) : 'N/A');
  console.log('🔧 OWN_URL:', process.env.OWN_URL);

  const sanitized = sanitizeYts(data, url, {
    maxMovies: 50,
    useLegalHashes: true,
    legalHashProbability: 0.6,
    changeDownloadUrlOrigin: process.env.OWN_URL,
  });

  console.log('🔧 Sanitization complete');
  return sanitized;
}

// Export the sanitize function as default for backward compatibility
export default sanitize;
