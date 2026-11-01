export interface ProbeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Whether a Miauflix server answers at `url` (an origin), by its unauthenticated health check.
 * Servers from before the health check named the service only answer `status: 'ok'`.
 */
export async function probeServer(
  url: string,
  { timeoutMs = 4000, signal }: ProbeOptions = {}
): Promise<boolean> {
  // AbortSignal.timeout and .any are newer than the TVs' Chromium 69
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  signal?.addEventListener('abort', abort);
  try {
    const response = await fetch(`${url}/api/health`, {
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { status?: unknown; service?: unknown };
    return body.status === 'ok' && (body.service === undefined || body.service === 'miauflix');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
