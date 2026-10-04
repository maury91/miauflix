import { pollTraktAssociation } from '@features/integrations/api/trakt.api';
import type { ProviderAuthorization } from '@miauflix/service-contracts';
import { useEffect, useRef } from 'react';

interface TraktAuthorizationPollingOptions {
  authorization: ProviderAuthorization | null;
  sessionId: string;
  onConnected: () => void;
  onError: (message: string | null) => void;
}

export function useTraktAuthorizationPolling({
  authorization,
  sessionId,
  onConnected,
  onError,
}: TraktAuthorizationPollingOptions) {
  const callbacks = useRef({ onConnected, onError });
  callbacks.current = { onConnected, onError };

  useEffect(() => {
    if (!authorization) return;
    const interval = Math.max(5000, authorization.interval * 1000);
    let delay = interval;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      const result = await pollTraktAssociation(authorization.authorizationId, sessionId);
      if (cancelled) return;
      if ('error' in result) {
        callbacks.current.onError(result.error.data);
        if (result.error.status === 429) {
          delay = Math.min(delay * 2, Math.max(interval, 60000));
        }
      } else {
        callbacks.current.onError(null);
        delay = interval;
        if (result.data.state === 'connected') {
          callbacks.current.onConnected();
          return;
        }
        if (result.data.state !== 'pending') {
          callbacks.current.onError('The Trakt authorization expired. Try again.');
          return;
        }
      }
      timer = window.setTimeout(poll, delay);
    };
    timer = window.setTimeout(poll, interval);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [authorization, sessionId]);
}
