import { useCallback, useEffect, useMemo } from 'react';
import { TVInputDeviceKeyName } from '../../../../../tizen';
import { IS_TIZEN } from '../../../../../consts';

const SPECIAL_KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
] as const;

const isSpecialKey = (key: string): key is (typeof SPECIAL_KEYS)[number] => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return SPECIAL_KEYS.includes(key as any);
};

type TVInputDeviceListenerArgs = {
  cb: (type: 'up' | 'down') => void;
  triggerOnUp: boolean;
};

export const useTizenRemote = () => {
  const mappedKeys = useMemo(
    () => new Map<TVInputDeviceKeyName, TVInputDeviceListenerArgs>(),
    []
  );
  useEffect(() => {
    if (!IS_TIZEN) {
      return;
    }

    function executeCallback(key: TVInputDeviceKeyName, type: 'up' | 'down') {
      const callback = mappedKeys.get(key);
      if (callback && (type === 'down' || callback.triggerOnUp)) {
        callback.cb(type);
      }
    }

    function keyboardListener(event: KeyboardEvent) {
      if (event.keyCode in window.INVERTED_REMOTE_KEY_MAP) {
        const keyName = window.INVERTED_REMOTE_KEY_MAP[event.keyCode];
        executeCallback(keyName, event.type === 'keydown' ? 'down' : 'up');
      } else {
        const { key } = event;
        if (isSpecialKey(key)) {
          executeCallback(key, event.type === 'keydown' ? 'down' : 'up');
        }
      }
    }

    document.body.addEventListener('keydown', keyboardListener);
    document.body.addEventListener('keyup', keyboardListener);
    return () => {
      document.body.removeEventListener('keydown', keyboardListener);
      document.body.removeEventListener('keyup', keyboardListener);
    };
  }, [mappedKeys]);
  return useCallback(
    (
      key: TVInputDeviceKeyName,
      cb: (type: 'up' | 'down') => void,
      triggerOnUp = false
    ) => {
      mappedKeys.set(key, { cb, triggerOnUp });
    },
    [mappedKeys]
  );
};
