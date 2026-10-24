import { useEffect, useRef } from 'react';

/**
 * Run `onChange` after the signed-in session changes (not on mount), so each hook can drop
 * the state that belonged to the previous account.
 */
export function useSessionChange(sessionId: string | null, onChange: () => void): void {
  const previous = useRef(sessionId);
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    if (previous.current === sessionId) return;
    previous.current = sessionId;
    latest.current();
  }, [sessionId]);
}
