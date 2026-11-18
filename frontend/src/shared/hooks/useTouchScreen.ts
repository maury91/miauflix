import { useEffect, useState } from 'react';

/**
 * Any touch screen, even beside a mouse (a touchscreen laptop reports the mouse as its primary
 * pointer): what only pointing or a remote reveals must also be reachable by a tap.
 */
const TOUCH_QUERY = '(any-pointer: coarse)';

const query = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(TOUCH_QUERY)
    : null;

/** Whether the device has a touch screen, following changes (a tablet's keyboard docked). */
export function useTouchScreen(): boolean {
  const [touch, setTouch] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const list = query();
    if (!list) return undefined;
    const update = () => setTouch(list.matches);
    update();
    // Chromium 69 (the 2020 TVs) has only the older listener methods
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', update);
      return () => list.removeEventListener('change', update);
    }
    list.addListener(update);
    return () => list.removeListener(update);
  }, []);
  return touch;
}
