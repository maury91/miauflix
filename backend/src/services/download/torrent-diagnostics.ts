import { logger } from '@logger';
import type WebTorrent from 'webtorrent';
import type { Torrent } from 'webtorrent';

/** Scalar observations only: diagnostics must not retain removed torrents or peer addresses. */
export class TorrentDiagnostics {
  private readonly observations = new WeakMap<
    Torrent,
    {
      id: number;
      addedAt: number;
      discoveredPeers: number;
      warnings: number;
      errors: number;
    }
  >();
  private added = 0;
  private closed = 0;
  private previousCpu = process.cpuUsage();
  private previousTime = process.hrtime.bigint();
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly client: WebTorrent,
    private readonly context: () => Record<string, number>
  ) {
    client.on('add', this.track);
    client.torrents.forEach(this.track);
    this.timer = setInterval(() => {
      if (client.destroyed) {
        this.stop();
        return;
      }
      this.report();
    }, 60_000);
    this.timer.unref();
  }

  private readonly track = (torrent: Torrent): void => {
    if (this.observations.has(torrent)) return;
    const observation = {
      id: ++this.added,
      addedAt: Date.now(),
      discoveredPeers: 0,
      warnings: 0,
      errors: 0,
    };
    this.observations.set(torrent, observation);
    const log = (event: string) =>
      logger.info('TorrentDiagnostics', 'Torrent lifecycle', {
        event,
        torrentId: observation.id,
        ageMs: Date.now() - observation.addedAt,
        ready: torrent.ready,
        peers: torrent.numPeers ?? 0,
        downloadedBytes: torrent.downloaded ?? 0,
        discoveredPeers: observation.discoveredPeers,
        warnings: observation.warnings,
        errors: observation.errors,
      });
    log('added');
    torrent.once('metadata', () => log('metadata'));
    torrent.once('ready', () => log('ready'));
    torrent.once('done', () => log('done'));
    torrent.on('peer', () => {
      observation.discoveredPeers += 1;
    });
    torrent.on('warning', () => {
      observation.warnings += 1;
    });
    torrent.on('error', () => {
      observation.errors += 1;
    });
    torrent.once('close', () => {
      this.closed += 1;
      log('closed');
    });
  };

  report(): void {
    const now = Date.now();
    const torrents = this.client.torrents.map(torrent => {
      this.track(torrent);
      const observation = this.observations.get(torrent)!;
      const wires = torrent.wires ?? [];
      return {
        torrentId: observation.id,
        ageMs: now - observation.addedAt,
        ready: Boolean(torrent.ready),
        destroyed: Boolean(torrent.destroyed),
        paused: Boolean(torrent.paused),
        done: Boolean(torrent.done),
        peers: torrent.numPeers ?? 0,
        wires: wires.length,
        outgoingRequests: wires.reduce((sum, wire) => sum + (wire.requests?.length ?? 0), 0),
        incomingRequests: wires.reduce((sum, wire) => sum + (wire.peerRequests?.length ?? 0), 0),
        discoveredPeers: observation.discoveredPeers,
        warnings: observation.warnings,
        errors: observation.errors,
        downloadedBytes: torrent.downloaded ?? 0,
        receivedBytes: torrent.received ?? 0,
        uploadedBytes: torrent.uploaded ?? 0,
        downloadBytesPerSecond: torrent.downloadSpeed ?? 0,
        uploadBytesPerSecond: torrent.uploadSpeed ?? 0,
      };
    });
    const elapsed = Number(process.hrtime.bigint() - this.previousTime) / 1000;
    const cpu = process.cpuUsage(this.previousCpu);
    this.previousCpu = process.cpuUsage();
    this.previousTime = process.hrtime.bigint();
    // All memory values are process-wide; arrayBuffers is included in external, not additive.
    logger.info('TorrentDiagnostics', 'Torrent resource snapshot', {
      processMemoryBytes: process.memoryUsage(),
      processCpuPercent: Math.round(((cpu.user + cpu.system) / elapsed) * 100),
      ...this.context(),
      added: this.added,
      closed: this.closed,
      torrentCount: torrents.length,
      pendingMetadata: torrents.filter(torrent => !torrent.ready && !torrent.destroyed).length,
      peers: torrents.reduce((sum, torrent) => sum + torrent.peers, 0),
      wires: torrents.reduce((sum, torrent) => sum + torrent.wires, 0),
      outgoingRequests: torrents.reduce((sum, torrent) => sum + torrent.outgoingRequests, 0),
      incomingRequests: torrents.reduce((sum, torrent) => sum + torrent.incomingRequests, 0),
      // Bound log size, prioritizing unresolved magnets, then the busiest torrents.
      torrents: torrents
        .sort(
          (left, right) =>
            Number(left.ready) - Number(right.ready) ||
            right.wires - left.wires ||
            right.ageMs - left.ageMs
        )
        .slice(0, 20),
      omittedTorrents: Math.max(0, torrents.length - 20),
    });
  }

  stop(): void {
    clearInterval(this.timer);
    this.client.off('add', this.track);
  }
}
