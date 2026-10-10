import { pollTraktAssociation } from '@features/integrations/api/trakt.api';
import type { ProviderAuthorization } from '@miauflix/service-contracts';
import { useEffect, useRef } from 'react';

interface TraktAuthorizationPollingOptions {
  authorization: ProviderAuthorization | null;
  sessionId: string;
  onConnected: () => void;
  onError: (message: string | null) => void;
}

/**
 * Poll after the provider interval (in seconds), with a minimum delay of five seconds.
 * Pending results and request errors retry; HTTP 429 doubles the delay up to the greater of
 * 60 seconds and the base interval. Success resets the delay. Connected or non-pending
 * states stop polling. Cleanup cancels scheduled polls and ignores in-flight responses.
 */
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
      let result: Awaited<ReturnType<typeof pollTraktAssociation>>;
      try {
        result = await pollTraktAssociation(authorization.authorizationId, sessionId);
      } catch (error) {
        if (cancelled) return;
        callbacks.current.onError(
          error instanceof Error ? error.message : 'Unable to check Trakt association'
        );
        timer = window.setTimeout(poll, delay);
        return;
      }
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
