import { useEffect, useState } from 'react';

/** A touch screen without hover: nothing on it can be revealed by pointing or by a remote. */
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

const query = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(TOUCH_QUERY)
    : null;

/** Whether the primary input is a touch screen, following changes (a tablet's keyboard docked). */
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
