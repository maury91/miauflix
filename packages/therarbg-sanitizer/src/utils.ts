import { extractSourceMetadata } from '@miauflix/source-metadata-extractor';

import {
  generateFakeMovieTitle,
  generateFakePersonName as generateFakePersonNameFromConstants,
  generateFakeTVTitle,
  LEGAL_HASHES,
  SAFE_HASH_CHARS,
} from './constants';
import type { ContentType, LegalHash, SanitizationOptions, TitleMapping } from './types';

/**
 * Simple hash function for deterministic generation
 */
export function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Determines if a given IMDB ID should use a legal hash
 * Odd IMDB IDs use legal hashes, even IDs use fake hashes
 */
export function shouldUseLegalHash(imdbId: string): boolean {
  // Extract numeric part from IMDB ID (e.g., "tt0111161" -> 111161)
  const numericPart = imdbId.replace(/^tt0*/, '');
  const numericValue = parseInt(numericPart, 10);

  // Return true for odd numbers (legal hash), false for even (fake hash)
  return numericValue % 2 === 1;
}

/**
 * Advanced legal hash selection with multiple strategies
 */
export function selectLegalHash(
  imdbId: string,
  options: SanitizationOptions = {},
  contentType?: ContentType
): string {
  // Handle edge cases
  if (!imdbId || typeof imdbId !== 'string') {
    imdbId = 'fallback_seed';
  }

  const strategy = options.legalHashStrategy || 'imdb-based';
  const seed = options.customSeed || imdbId;

  switch (strategy) {
    case 'imdb-based':
      return selectLegalHashImdbBased(seed, contentType);

    case 'weighted':
      return selectLegalHashWeighted(seed, contentType);

    case 'sequential':
      return selectLegalHashSequential(seed);

    case 'random':
      return selectLegalHashRandom(seed, contentType);

    default:
      return selectLegalHashImdbBased(seed, contentType);
  }
}

/**
 * IMDB-based selection with content type consideration
 */
function selectLegalHashImdbBased(seed: string, contentType?: ContentType): string {
  // Handle edge cases
  if (!seed || typeof seed !== 'string') {
    seed = 'fallback_seed';
  }

  // Extract numeric part for deterministic selection
  const numericPart = seed.replace(/^tt0*/, '') || '1';
  const numericValue = parseInt(numericPart, 10) || 1;

  // Filter hashes by content type if specified
  let availableHashes = LEGAL_HASHES;
  if (contentType) {
    const typeMatches = LEGAL_HASHES.filter(h => h.type === contentType);
    if (typeMatches.length > 0) {
      availableHashes = typeMatches;
    }
  }

  // Ensure we have hashes available
  if (availableHashes.length === 0) {
    availableHashes = LEGAL_HASHES;
  }

  // Use seed to deterministically select from available hashes
  const index = numericValue % availableHashes.length;
  return availableHashes[index].hash;
}

/**
 * Weighted selection based on hash quality/reliability scores
 */
function selectLegalHashWeighted(seed: string, contentType?: ContentType): string {
  // Handle edge cases
  if (!seed || typeof seed !== 'string') {
    seed = 'fallback_seed';
  }

  // Filter by content type if specified
  let availableHashes = LEGAL_HASHES;
  if (contentType) {
    const typeMatches = LEGAL_HASHES.filter(h => h.type === contentType);
    if (typeMatches.length > 0) {
      availableHashes = typeMatches;
    }
  }

  // Ensure we have hashes available
  if (availableHashes.length === 0) {
    availableHashes = LEGAL_HASHES;
  }

  // Calculate total weight
  const totalWeight = availableHashes.reduce((sum, hash) => sum + (hash.weight || 1), 0);

  // Generate deterministic random value based on seed
  const seedNum = hashStringToNumber(seed);
  const randomValue = (seedNum % 1000) / 1000; // Normalize to 0-1
  const targetWeight = randomValue * totalWeight;

  // Select hash based on weighted probability
  let currentWeight = 0;
  for (const hash of availableHashes) {
    currentWeight += hash.weight || 1;
    if (currentWeight >= targetWeight) {
      return hash.hash;
    }
  }

  // Fallback to last hash
  return availableHashes[availableHashes.length - 1].hash;
}

/**
 * Sequential selection for predictable testing
 */
function selectLegalHashSequential(seed: string): string {
  // Handle edge cases
  if (!seed || typeof seed !== 'string') {
    seed = 'fallback_seed';
  }

  const seedNum = hashStringToNumber(seed);
  const index = seedNum % LEGAL_HASHES.length;
  return LEGAL_HASHES[index].hash;
}

/**
 * Random selection with optional content type filtering
 */
function selectLegalHashRandom(seed: string, contentType?: ContentType): string {
  // Handle edge cases
  if (!seed || typeof seed !== 'string') {
    seed = 'fallback_seed';
  }

  // Filter by content type if specified
  let availableHashes = LEGAL_HASHES;
  if (contentType) {
    const typeMatches = LEGAL_HASHES.filter(h => h.type === contentType);
    if (typeMatches.length > 0) {
      availableHashes = typeMatches;
    }
  }

  // Ensure we have hashes available
  if (availableHashes.length === 0) {
    availableHashes = LEGAL_HASHES;
  }

  const seedNum = hashStringToNumber(seed);
  const index = seedNum % availableHashes.length;
  return availableHashes[index].hash;
}

/**
 * Get legal hash metadata for a given hash
 */
export function getLegalHashMetadata(hash: string): LegalHash | undefined {
  return LEGAL_HASHES.find(h => h.hash.toUpperCase() === hash.toUpperCase());
}

/**
 * Get all available legal hashes filtered by criteria
 */
export function getAvailableLegalHashes(
  contentType?: ContentType,
  minWeight?: number,
  yearRange?: { min?: number; max?: number }
): LegalHash[] {
  let filtered = [...LEGAL_HASHES];

  if (contentType) {
    filtered = filtered.filter(h => h.type === contentType);
  }

  if (minWeight !== undefined) {
    filtered = filtered.filter(h => (h.weight || 1) >= minWeight);
  }

  if (yearRange) {
    filtered = filtered.filter(h => {
      if (!h.year) return true; // Include hashes without year info
      if (yearRange.min && h.year < yearRange.min) return false;
      if (yearRange.max && h.year > yearRange.max) return false;
      return true;
    });
  }

  return filtered;
}

/**
 * Validate that minimum legal hashes are available for given criteria
 */
export function validateLegalHashAvailability(
  options: SanitizationOptions,
  contentType?: ContentType
): { isValid: boolean; available: number; required: number } {
  const required = options.minLegalHashes || 5;
  const available = getAvailableLegalHashes(contentType).length;

  return {
    isValid: available >= required,
    available,
    required,
  };
}

/**
 * Generate a safe info hash (40 hex characters)
 * Enhanced with IMDB-based legal hash selection
 */
export function generateSafeInfoHash(
  originalHash: string,
  imdbId?: string,
  useLegalHashes = false,
  options: SanitizationOptions = {},
  contentType?: ContentType
): string {
  // If using legal hashes and IMDB ID suggests legal hash usage
  if (useLegalHashes && imdbId && shouldUseLegalHash(imdbId)) {
    return selectLegalHash(imdbId, options, contentType);
  }

  // Generate fake hash based on original
  const seed = imdbId || originalHash;
  const seedNum = hashStringToNumber(seed);

  let result = '';
  for (let i = 0; i < 40; i++) {
    const charIndex = (seedNum + i * 17) % SAFE_HASH_CHARS.length;
    result += SAFE_HASH_CHARS[charIndex];
  }

  return result;
}

/**
 * Hash a string to a number for seeding (djb2 hash algorithm)
 */
function hashStringToNumber(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Generate a fake title deterministically from input
 */
export function generateFakeTitle(input: string, contentType: ContentType): string {
  return contentType === 'Movie' ? generateFakeMovieTitle(input) : generateFakeTVTitle(input);
}

/**
 * Generate a fake IMDB ID deterministically from input
 */
export function generateFakeImdbId(input: string, contentType: ContentType): string {
  const hash = simpleHash(input + '_' + contentType);
  // Generate a 7-digit number
  const idNumber = (hash % 9000000) + 1000000;
  return `tt${idNumber}`;
}

/**
 * Generate a fake person name deterministically from input
 */
export function generateFakePersonName(input: string): string {
  return generateFakePersonNameFromConstants(input);
}

/**
 * Sanitize name using source metadata extraction
 */
export function sanitizeName(
  name: string,
  titleMapping: TitleMapping,
  preserveTechnicalMetadata: boolean = true
): string {
  if (!preserveTechnicalMetadata) {
    return titleMapping.fakeTitle;
  }

  try {
    // Extract metadata using the source metadata extractor
    const metadata = extractSourceMetadata({
      name: name,
      size: 1000000000, // 1GB default size
    });

    if (metadata.title) {
      // Replace the extracted title with the fake title
      let sanitized = name;

      // Try to replace the title while preserving technical metadata
      // First try exact match
      if (sanitized.includes(metadata.title)) {
        sanitized = sanitized.replace(metadata.title, titleMapping.fakeTitle);
      } else {
        // Try case-insensitive match
        const titleRegex = new RegExp(metadata.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        sanitized = sanitized.replace(titleRegex, titleMapping.fakeTitle);
      }

      // If the above didn't work, try replacing with dots/spaces conversion
      if (sanitized === name) {
        // Convert title to dot format and try again
        const titleWithDots = metadata.title.replace(/\s+/g, '.');
        if (sanitized.includes(titleWithDots)) {
          const fakeWithDots = titleMapping.fakeTitle.replace(/\s+/g, '.');
          sanitized = sanitized.replace(titleWithDots, fakeWithDots);
        }
      }

      return sanitized;
    }
  } catch (error) {
    // If extraction fails, fall back to simple replacement
    console.warn('Source metadata extraction failed:', error);
  }

  // Fallback: replace the real title with fake title
  let sanitized = name;
  if (titleMapping.realTitle) {
    // Try exact match first
    if (sanitized.includes(titleMapping.realTitle)) {
      sanitized = sanitized.replace(titleMapping.realTitle, titleMapping.fakeTitle);
    } else {
      // Try with dots instead of spaces
      const realTitleWithDots = titleMapping.realTitle.replace(/\s+/g, '.');
      if (sanitized.includes(realTitleWithDots)) {
        const fakeWithDots = titleMapping.fakeTitle.replace(/\s+/g, '.');
        sanitized = sanitized.replace(realTitleWithDots, fakeWithDots);
      }
    }
  }

  return sanitized;
}

/**
 * Generate a fake plot/description
 */
export function generateFakePlot(
  originalPlot: string,
  titleMapping:
    | TitleMapping
    | {
        realTitle?: string;
        fakeTitle: string;
        realImdbId?: string;
        fakeImdbId: string;
        contentType: 'Movie' | 'TV';
      }
): string {
  if (!originalPlot) return originalPlot;

  let sanitized = originalPlot;

  // Replace real title with fake title if present
  if (titleMapping.realTitle) {
    const titleRegex = new RegExp(
      titleMapping.realTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'gi'
    );
    sanitized = sanitized.replace(titleRegex, titleMapping.fakeTitle);
  }

  // Replace IMDB ID if present
  if (titleMapping.realImdbId && titleMapping.realImdbId !== 'unknown') {
    const imdbRegex = new RegExp(
      titleMapping.realImdbId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'gi'
    );
    sanitized = sanitized.replace(imdbRegex, titleMapping.fakeImdbId);
  }

  return sanitized;
}

/**
 * Generate a fake URL
 */
export function generateFakeUrl(originalUrl: string, seed: string): string {
  if (!originalUrl) return originalUrl;

  const hash = simpleHash(seed);
  const urlParts = originalUrl.split('/');
  const filename = urlParts[urlParts.length - 1];
  const extension = filename.includes('.') ? filename.split('.').pop() : '';

  return `https://fake-cdn.example.com/fake-${hash % 100000}${extension ? '.' + extension : ''}`;
}
