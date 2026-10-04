const MAX_RETRY_AFTER_MS = 5 * 60_000;

export function retryAfterMs(value: string | null, now = Date.now()): number {
  if (value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)))
    return Math.min(Number(value) * 1000, MAX_RETRY_AFTER_MS);
  const at = value ? Date.parse(value) : NaN;
  if (Number.isFinite(at) && at > now) return Math.min(at - now, MAX_RETRY_AFTER_MS);
  return 5_000;
}

let requestQueue: Promise<unknown> = Promise.resolve();
let nextRequestAt = 0;

/** One shared provider lane prevents bursts after a cooldown across all accounts. */
export function withTraktRequestSlot<T>(method: string, request: () => Promise<T>): Promise<T> {
  const pending = requestQueue
    .catch(() => undefined)
    .then(async () => {
      const delay = nextRequestAt - Date.now();
      if (delay > 0) await new Promise<void>(resolve => setTimeout(resolve, delay));
      try {
        return await request();
      } finally {
        nextRequestAt = Date.now() + (method === 'GET' ? 300 : 1_000);
      }
    });
  requestQueue = pending;
  return pending;
}
