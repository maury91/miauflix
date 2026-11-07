import type { Torrent } from 'webtorrent';

/** WebTorrent internals the fence drives; pinned with the webtorrent version. */
interface FenceableTorrent {
  destroyed?: boolean;
  infoHash?: string;
  pause(): void;
  resume(): void;
  removePeer(id: string): void;
  _peers?: Map<string, unknown> | null;
  discovery?: { destroy(cb?: () => void): void } | null;
  _startDiscovery?: () => void;
}

/**
 * Cuts a torrent off the network: a paused torrent accepts and dials no peers, the current ones
 * are dropped, and tracker and DHT announces stop with its discovery. Pieces already stored stay.
 */
export function fenceTorrent(torrent: Torrent): void {
  const fenced = torrent as unknown as FenceableTorrent;
  if (fenced.destroyed) return;
  fenced.pause();
  for (const id of [...(fenced._peers?.keys() ?? [])]) fenced.removePeer(id);
  const discovery = fenced.discovery;
  if (discovery) {
    fenced.discovery = null;
    discovery.destroy();
  }
}

/** Undoes `fenceTorrent`: peers are accepted again and discovery announces again. */
export function unfenceTorrent(torrent: Torrent): void {
  const fenced = torrent as unknown as FenceableTorrent;
  if (fenced.destroyed) return;
  fenced.resume();
  // Discovery starts once the info hash is parsed; one that is not yet parsed starts on its own.
  if (fenced.infoHash && !fenced.discovery) fenced._startDiscovery?.();
}
