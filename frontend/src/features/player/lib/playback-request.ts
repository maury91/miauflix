import type { PlaybackPreferences } from '@features/player/api/playback.api';
import { API_URL, builtForTizen } from '@shared/config/constants';

import { playbackAudioCapabilities } from './audio-language';
import { avplayCapabilities } from './avplay-media';

/** Backend paths as URLs in the TV app: its page is a local file, so relative paths miss the backend. */
export function backendUrl(path: string): string {
  return builtForTizen && path.startsWith('/') ? `${API_URL.replace(/\/+$/, '')}${path}` : path;
}

/**
 * What this client can decode, so the backend can choose how to deliver the file, and the audio
 * languages it starts with: the profile's (`audioLanguage`) before the device's.
 */
export function playbackPreferences(avplay: boolean, audioLanguage?: string): PlaybackPreferences {
  const capabilities = playbackAudioCapabilities(document.createElement('video'));
  const audioLanguages = audioLanguage
    ? [...new Set([audioLanguage, ...(capabilities.audioLanguages ?? [])])].slice(0, 20)
    : capabilities.audioLanguages;
  return {
    quality: 'auto',
    ...capabilities,
    audioLanguages,
    ...(avplay ? avplayCapabilities() : {}),
  };
}
