import './utils/polyfills';

import { IS_TIZEN } from '@shared/config/constants';

import type { TVInputDeviceKeyName } from '@/types/tizen';

/**
 * Remote keys the TV keeps for itself unless the app registers them. Exit and the colour keys
 * stay with the TV, so Exit still closes the app.
 */
const appSupportedKeys: TVInputDeviceKeyName[] = [
  'MediaPlay',
  'MediaPause',
  'MediaStop',
  'MediaPlayPause',
  'MediaTrackPrevious',
  'MediaTrackNext',
  'MediaRewind',
  'MediaFastForward',
  'Search',
];

function registerRemoteKeys(): void {
  const supported = new Set(window.tizen.tvinputdevice.getSupportedKeys().map(key => key.name));
  appSupportedKeys
    .filter(name => supported.has(name))
    .forEach(name => window.tizen.tvinputdevice.registerKey(name));
}

if (IS_TIZEN) {
  registerRemoteKeys();
}
