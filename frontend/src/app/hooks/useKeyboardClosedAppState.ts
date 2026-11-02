import type { AppState } from '@app/hooks/useAppState';
import { builtForTizen } from '@shared/config/constants';
import { useEffect, useRef, useState } from 'react';

/** Leaving login goes ahead after this long even if the keyboard has not closed. */
const KEYBOARD_CLOSE_TIMEOUT_MS = 1_500;

/** The TV shrinks the page while its on-screen keyboard is open (1080 to 540 pixels high). */
const keyboardOpen = () => window.innerHeight < window.screen.height * 0.9;

/**
 * The app state, except that on the TV leaving login waits for the on-screen keyboard to close.
 * The keyboard shrinks the page, and the logo and the intro place themselves on the page they
 * start on: signing in with the QR code while a field had the keyboard open started the intro
 * well above the middle of the screen. Leaving login blurs the field, which closes the keyboard.
 */
export function useKeyboardClosedAppState(appState: AppState): AppState {
  const [, rerender] = useState(0);
  const shown = useRef(appState);
  const waiting =
    builtForTizen &&
    shown.current === 'login' &&
    appState !== 'login' &&
    typeof window !== 'undefined' &&
    keyboardOpen();
  const [timedOut, setTimedOut] = useState(false);
  const held = waiting && !timedOut;
  if (!held) shown.current = appState;

  useEffect(() => {
    if (!held) {
      setTimedOut(false);
      return undefined;
    }
    const field = document.activeElement;
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.blur();
    const check = () => rerender(count => count + 1);
    window.addEventListener('resize', check);
    const timeout = window.setTimeout(() => setTimedOut(true), KEYBOARD_CLOSE_TIMEOUT_MS);
    return () => {
      window.removeEventListener('resize', check);
      window.clearTimeout(timeout);
    };
  }, [held]);

  return held ? 'login' : appState;
}
