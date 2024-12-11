import { IS_TIZEN } from '../../consts';
import { TVInputDeviceKeyName } from '../../tizen';
import { useCallback } from 'react';
import { Page } from '../../types';
import { store } from '../../store/store';

type Control =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'enter'
  | 'back'
  | 'playPause'
  | 'play'
  | 'pause'
  | 'stop';
type Callback = { cb: () => boolean | void; deepness: number };

const listeners: Record<Control, Callback[]> = {
  up: [],
  down: [],
  left: [],
  right: [],
  enter: [],
  back: [],
  playPause: [],
  play: [],
  pause: [],
  stop: [],
};

const keyCodesMap: Map<number, Control> = new Map();

if (IS_TIZEN) {
  const appSupportedKeys: Map<TVInputDeviceKeyName, Control> = new Map([
    ['MediaPlay', 'play'],
    ['MediaPause', 'pause'],
    ['MediaStop', 'stop'],
    ['MediaPlayPause', 'playPause'],
    ['Exit', 'back'],
    // 'MediaTrackPrevious',
    // 'MediaTrackNext',
    // 'MediaRewind',
    // 'MediaFastForward',
    // 'Menu',
    // 'Info',
    // 'Search',
    // 'Caption',
  ]);

  const supportedKeys = window.tizen.tvinputdevice.getSupportedKeys();
  supportedKeys.forEach((key) => {
    const control = appSupportedKeys.get(key.name);
    if (control) {
      window.tizen.tvinputdevice.registerKey(key.name);
      keyCodesMap.set(key.code, control);
    }
  });
}

const executeCallbacks = (callbacks: Callback[], event: KeyboardEvent) => {
  for (const { cb } of callbacks) {
    if (cb()) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  }
  return false;
};

document.body.addEventListener(
  'keydown',
  (event) => {
    switch (event.code) {
      case 'ArrowUp':
        return executeCallbacks(listeners.up, event);
      case 'ArrowDown':
        return executeCallbacks(listeners.down, event);
      case 'ArrowLeft':
        return executeCallbacks(listeners.left, event);
      case 'ArrowRight':
        return executeCallbacks(listeners.right, event);
      case 'Enter':
        return executeCallbacks(listeners.enter, event);
      case 'Backspace':
      case 'Back':
      case 'Escape':
        return executeCallbacks(listeners.back, event);
      case ' ':
        return executeCallbacks(listeners.playPause, event);
    }
    const control = keyCodesMap.get(event.keyCode);
    if (control) {
      return executeCallbacks(listeners[control], event);
    }
    return undefined;
  },
  { passive: false }
);

export const useControls = (page: Page) => {
  return useCallback(
    (control: Control, cb: () => boolean | void, deepness = 1) => {
      const wrappedCb = () => {
        if (page === store.getState().app.currentPage) {
          return false;
        }
        return cb();
      };
      listeners[control].push({ cb: wrappedCb, deepness });
      listeners[control].sort((a, b) => b.deepness - a.deepness);
      return () => {
        const index = listeners[control].findIndex(
          (item) => item.cb === wrappedCb
        );
        if (index !== -1) {
          listeners[control].splice(index, 1);
        }
      };
    },
    [page]
  );
};
