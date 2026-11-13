import type { PlaybackPreferences } from '@features/player/api/playback.api';
import { API_URL, builtForTizen } from '@shared/config/constants';

import { playbackAudioCapabilities } from './audio-language';
import { AVPLAY_CAPABILITIES } from './avplay-media';

/** Backend paths as URLs in the TV app: its page is a local file, so relative paths miss the backend. */
export function backendUrl(path: string): string {
  return builtForTizen && path.startsWith('/') ? `${API_URL.replace(/\/+$/, '')}${path}` : path;
}

/** What this client can decode, so the backend can choose how to deliver the file. */
export function playbackPreferences(avplay: boolean): PlaybackPreferences {
  return {
    quality: 'auto',
    ...playbackAudioCapabilities(document.createElement('video')),
    ...(avplay ? AVPLAY_CAPABILITIES : {}),
  };
}
