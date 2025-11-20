/**
 * Utility functions for YTS sanitization
 */

import { faker } from '@faker-js/faker';
import seedrandom from 'seedrandom';
import { adjectives, animals, uniqueNamesGenerator } from 'unique-names-generator';

import { LEGAL_HASH_LIST } from './constants';

// Cache for consistent data across calls
const cache = new Map<string, any>();

/**
 * Initialize faker with deterministic seed based on input
 */
export function initFaker(id: number): void {
  faker.seed(id);
}

/**
 * Generate consistent fake data with caching
 */
export function getCached<T>(key: string, generator: () => T): T {
  if (cache.has(key)) {
    return cache.get(key);
  }
  const value = generator();
  cache.set(key, value);
  return value;
}

/**
 * Generate RNG from seed
 */
export function rngFromSeed(seed: string): seedrandom.PRNG {
  return seedrandom(seed);
}

/**
 * Pick a legal hash deterministically
 */
export function pickLegal(seed: string): string {
  const rnd = rngFromSeed(seed);
  const idx = Math.floor(rnd() * LEGAL_HASH_LIST.length);
  return LEGAL_HASH_LIST[idx] || LEGAL_HASH_LIST[0]!;
}

/**
 * Generate random hash from seed
 */
export function randomHash(seed: string): string {
  const rnd = rngFromSeed(seed);
  let hex = '';
  while (hex.length < 40) {
    hex += Math.floor(rnd() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  }
  return hex.slice(0, 40).toUpperCase();
}

/**
 * Deterministically choose a replacement hash.
 * 60% probability → legal known hash, 40% → seeded pseudo-random.
 */
export function replacementHash(original: string, legalHashProbability: number = 0.6): string {
  const seed = original.toUpperCase();
  const rnd = rngFromSeed(seed);
  return rnd() < legalHashProbability ? pickLegal(seed) : randomHash(seed);
}

/**
 * Generate fake movie title
 */
export function generateTitle(id: string): string {
  const seed = seedrandom(id);
  return getCached(`title:${id}`, () => {
    initFaker(seed.int32());
    return uniqueNamesGenerator({
      dictionaries: [adjectives, animals],
      separator: ' ',
      style: 'capital',
    });
  });
}

/**
 * Generate fake person name
 */
export function generatePersonName(id: number): string {
  return getCached(`person:${id}`, () => {
    initFaker(id);
    return faker.person.fullName();
  });
}

/**
 * Generate fake description/summary
 */
export function generateDescription(id: string, originalDescription: string): string {
  if (!originalDescription) return '';
  const seed = seedrandom(id);
  return getCached(`description:${id}`, () => {
    initFaker(seed.int32());
    // Generate 1-3 sentences
    const sentences = faker.helpers.rangeToNumber({ min: 1, max: 3 });
    return Array.from({ length: sentences }, () => faker.lorem.sentence()).join(' ');
  });
}

/**
 * Generate fake URL
 */
export function generateUrl(id: string, original: string): string {
  if (!original) return '';

  const seed = seedrandom(id);
  return getCached(`url:${id}`, () => {
    initFaker(seed.int32());
    const domain = faker.internet.domainName();
    const path = faker.system.directoryPath().replace(/\\/g, '/');
    return `https://${domain}${path}`;
  });
}

/**
 * Generate fake YouTube trailer code
 */
export function generateTrailerCode(id: string, original: string): string {
  if (!original) return '';

  const seed = seedrandom(id);
  return getCached(`trailer:${id}`, () => {
    initFaker(seed.int32());
    return faker.string.alphanumeric(11); // YouTube video IDs are 11 characters
  });
}

/**
 * Generate fake IMDB code
 */
export function generateImdbCode(id: string, original: string): string {
  if (!original || !original.startsWith('tt')) return original;

  const seed = seedrandom(id);
  return getCached(`imdb:${id}`, () => {
    initFaker(seed.int32());
    const number = faker.string.numeric(8);
    return `tt${number}`;
  });
}

/**
 * Clear the internal cache (useful for testing)
 */
export function clearCache(): void {
  cache.clear();
}
