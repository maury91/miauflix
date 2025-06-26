import type { ImdbDetailPost, ImdbIdValidation } from './therarbg.types';

/**
 * Validate and normalize IMDB ID
 */
export function validateImdbId(imdbId: string): ImdbIdValidation {
  if (!imdbId) {
    return { isValid: false, error: 'IMDB ID is required' };
  }

  // Remove any whitespace
  const cleaned = imdbId.trim();

  // Check if it already has tt prefix
  if (cleaned.match(/^tt\d{7,8}$/)) {
    return { isValid: true, normalizedId: cleaned };
  }

  // Check if it's just numbers
  if (cleaned.match(/^\d{7,8}$/)) {
    return { isValid: true, normalizedId: `tt${cleaned}` };
  }

  // Try to extract from URL
  const urlMatch = cleaned.match(/\/title\/(tt\d{7,8})/);
  if (urlMatch) {
    return { isValid: true, normalizedId: urlMatch[1] };
  }

  return { isValid: false, error: 'Invalid IMDB ID format' };
}

/**
 * Filter sources based on minimum requirements
 */
export function filterSources(
  sources: ImdbDetailPost[],
  { minBroadcasters = 2, minSizeMB = 100 }: { minBroadcasters?: number; minSizeMB?: number } = {}
): ImdbDetailPost[] {
  return sources.filter(source => {
    // Minimum broadcasters
    if (source.seeders < minBroadcasters) {
      return false;
    }

    // Minimum file size
    const sizeMB = source.size / (1024 * 1024);
    if (sizeMB < minSizeMB) {
      return false;
    }

    return true;
  });
}
