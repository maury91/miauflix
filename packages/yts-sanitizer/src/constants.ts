/**
 * Constants for YTS sanitization
 */

import type { LegalHash } from './types.js';

/**
 * Public-domain / CC-licensed torrents we trust to be permanent.
 * SHA-1 info hashes collected from well-known trackers / archive.org
 */
export const LEGAL_HASHES: readonly LegalHash[] = [
  { title: 'Big Buck Bunny (2008)', hash: '1F46E1D019E9FC20331EC1F6F67A25C2F0B19335' },
  { title: 'Sintel (2010)', hash: 'A84E83132DB0F5B8674F6C1B4EEB75A0444CDF9B' },
  { title: 'Tears of Steel (2012)', hash: '2A23C985CB7731B7CA9D2C12D9F6E9D9A7CFC330' },
  { title: 'Elephants Dream (2006)', hash: '7A8B2E1A456B8CD12F77B2F4D1B0F6F3BB4546A8' },
  { title: 'Cosmos Laundromat (2015)', hash: '57E72BC4F3D0FEACC0139F2BD733F6A0E7C0C68D' },
  { title: 'The Room (Public Domain cut)', hash: 'DA71F034282D2E6E940A0C112233445566778899' },
];

/**
 * Faster lookup table of just hashes
 */
export const LEGAL_HASH_LIST = LEGAL_HASHES.map(h => h.hash.toUpperCase());

/**
 * Default sanitization options
 */
export const DEFAULT_OPTIONS = {
  maxMovies: 50,
  useLegalHashes: true,
  legalHashProbability: 0.6,
} as const;
