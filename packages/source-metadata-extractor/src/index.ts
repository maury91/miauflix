// Export only the main function
export { type AnimeRelease, parseAnimeRelease } from './core/anime-release';
export { extractSourceMetadata } from './core/extractor';

// Export all types
export * from './types';

// Utility functions
export { calculateApproximateBitrate, detectAudioCodecFromChannels } from './utils';
