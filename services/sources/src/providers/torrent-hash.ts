import type { HttpClient } from '../http/http-client';
import { normalizeHash } from '../normalize/magnet';
import { magnetHash } from '../normalize/magnet';
import { torrentInfoHash } from '../util/bencode';
import type { RawResult } from './types';

export const MAX_TORRENT_BYTES = 2 * 1024 * 1024;
/** Extra requests a single search may spend turning download links into hashes. */
export const RESOLVE_LIMIT = 8;

export async function fetchInfoHash(
  url: string,
  ctx: { signal: AbortSignal; http: HttpClient; hosts?: string[] }
): Promise<string | null> {
  const response = await ctx.http.request(url, {
    signal: ctx.signal,
    maxBytes: MAX_TORRENT_BYTES,
    blockInternal: true,
    allowHosts: ctx.hosts ?? [],
    headers: { 'accept-encoding': 'identity' },
  });
  if (!response.ok) return null;
  return torrentInfoHash(new Uint8Array(await response.arrayBuffer()));
}

/**
 * Providers that only offer a .torrent link have no hash to search results by. Fetch the
 * best-seeded few, hash them, and drop whatever stays unresolved so no candidate lacks a hash.
 */
export async function resolveHashes(
  results: RawResult[],
  ctx: { signal: AbortSignal; http: HttpClient; hosts?: string[] },
  resolveLink?: (result: RawResult) => Promise<void>
): Promise<RawResult[]> {
  const known = results.filter(r => normalizeHash(r.hash ?? '') ?? magnetHash(r.magnet));
  const pending = results
    .filter(r => !known.includes(r) && (r.torrentUrl || r.detailsUrl))
    .sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0))
    .slice(0, RESOLVE_LIMIT);
  for (const result of pending) {
    ctx.signal.throwIfAborted();
    try {
      if (!result.torrentUrl && !result.magnet) await resolveLink?.(result);
      if (magnetHash(result.magnet)) continue;
      if (result.torrentUrl)
        result.hash = (await fetchInfoHash(result.torrentUrl, ctx)) ?? undefined;
    } catch {
      ctx.signal.throwIfAborted();
    }
  }
  return results.filter(r => normalizeHash(r.hash ?? '') ?? magnetHash(r.magnet));
}
