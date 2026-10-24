import { getTraktAssociation } from '@features/integrations/api/trakt.api';
import { progressApi } from '@features/progress/api/progress.api';
import type { AppDispatch } from '@store/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';

/** Idle time, without keyboard or pointer input, before the Trakt prompt opens. */
export const TRAKT_PROMPT_IDLE_MS = 5_000;

const dontAskKey = (userId: string) => `miauflix:trakt:dont-ask:${userId}`;

/**
 * Offer Trakt once per session to an unconnected user, after a quiet moment while browsing.
 * "Don't ask again" is remembered per user; closing it lasts for the session. Focus returns to
 * where it was when the prompt opened.
 */
export function useTraktPrompt({
  enabled,
  sessionId,
  userId,
}: {
  /** Browsing and interactive; anything else closes the prompt. */
  enabled: boolean;
  sessionId: string | null;
  userId: string | undefined;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const [open, setOpen] = useState(false);
  const focusOnClose = useRef<HTMLElement | null>(null);
  const dismissedSession = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !sessionId || !userId) {
      setOpen(false);
      return;
    }
    let cancelled = false;
    let eligible = false;
    let idleTimer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (cancelled || !eligible) return;
        // Show once per effect run; modal input must not restart the timer or overwrite focus.
        eligible = false;
        focusOnClose.current = document.activeElement as HTMLElement | null;
        setOpen(true);
      }, TRAKT_PROMPT_IDLE_MS);
    };
    // Capture on window: keyboard navigation stops handled keys at the document capture phase.
    window.addEventListener('keydown', schedule, true);
    window.addEventListener('pointermove', schedule, true);
    void getTraktAssociation(sessionId).then(result => {
      if (cancelled || !('data' in result) || result.data.connected) return;
      const permanentlyDismissed = window.localStorage.getItem(dontAskKey(userId)) === '1';
      if (!permanentlyDismissed && dismissedSession.current !== sessionId) {
        eligible = true;
        schedule();
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(idleTimer);
      window.removeEventListener('keydown', schedule, true);
      window.removeEventListener('pointermove', schedule, true);
    };
  }, [enabled, sessionId, userId]);

  const restoreFocus = () =>
    requestAnimationFrame(() => focusOnClose.current?.focus({ preventScroll: true }));

  const dismiss = useCallback(
    (permanent: boolean) => {
      if (userId && sessionId) {
        if (permanent) window.localStorage.setItem(dontAskKey(userId), '1');
        else dismissedSession.current = sessionId;
      }
      setOpen(false);
      restoreFocus();
    },
    [sessionId, userId]
  );

  const connected = useCallback(() => {
    // Trakt history becomes this account's progress.
    dispatch(progressApi.util.invalidateTags(['Progress']));
    setOpen(false);
    restoreFocus();
  }, [dispatch]);

  return { open, dismiss, connected };
}
