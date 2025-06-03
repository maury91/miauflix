import { IS_TIZEN } from '../../consts';
import { TVInputDeviceKeyName } from '../../tizen';
import { useCallback } from 'react';
import { Page } from '../../types';
import { store } from '../../store/store';
import { usePage } from '../contexts/page.context';

const allControls = [
  'up',
  'down',
  'left',
  'right',
  'enter',
  'back',
  'playPause',
  'play',
  'pause',
  'stop',
] as const;

type Control = (typeof allControls)[number];
type ControlsWithPressure = Control | `${Control}:released`;
type Callback = {
  cb: (key: ControlsWithPressure) => boolean | void;
  deepness: number;
};

const listeners: Record<ControlsWithPressure, Callback[]> = allControls
  .flatMap((control): ControlsWithPressure[] => [control, `${control}:released`])
  .reduce(
    (acc, control) => ({ ...acc, [control]: [] }),
    {} as Record<ControlsWithPressure, Callback[]>
  );

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
  supportedKeys.forEach(key => {
    const control = appSupportedKeys.get(key.name);
    if (control) {
      window.tizen.tvinputdevice.registerKey(key.name);
      keyCodesMap.set(key.code, control);
    }
  });
}

const executeCallbacks = (event: KeyboardEvent, control: Control) => {
  const controlWithPressure = event.type === 'keydown' ? control : (`${control}:released` as const);
  const callbacks = listeners[controlWithPressure];
  for (const { cb } of callbacks) {
    if (cb(controlWithPressure)) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  }
  return false;
};

const keyboardListener = (event: KeyboardEvent) => {
  switch (event.code) {
    case 'ArrowUp':
      return executeCallbacks(event, 'up');
    case 'ArrowDown':
      return executeCallbacks(event, 'down');
    case 'ArrowLeft':
      return executeCallbacks(event, 'left');
    case 'ArrowRight':
      return executeCallbacks(event, 'right');
    case 'Enter':
      return executeCallbacks(event, 'enter');
    case 'Backspace':
    case 'Back':
    case 'Escape':
      return executeCallbacks(event, 'back');
    case ' ':
      return executeCallbacks(event, 'playPause');
  }
  const control = keyCodesMap.get(event.keyCode);
  if (control) {
    return executeCallbacks(event, control);
  }
  return undefined;
};

document.body.addEventListener('keydown', keyboardListener, { passive: false });
document.body.addEventListener('keyup', keyboardListener, { passive: false });

export const useControls = (defaultPage?: Page) => {
  const page = usePage(defaultPage);

  return useCallback(
    <K extends ControlsWithPressure[]>(
      controls: K,
      cb: (key: K[number]) => boolean | void,
      deepness = 1
    ) => {
      const wrappedCb = (key: ControlsWithPressure) => {
        if (page !== store.getState().app.currentPage) {
          return false;
        }
        return cb(key);
      };
      for (const control of controls) {
        listeners[control].push({ cb: wrappedCb, deepness });
        // Sort in descending order
        listeners[control].sort((a, b) => b.deepness - a.deepness);
      }
      return () => {
        for (const control of controls) {
          const index = listeners[control].findIndex(item => item.cb === wrappedCb);
          if (index !== -1) {
            listeners[control].splice(index, 1);
          }
        }
      };
    },
    [page]
  );
};
