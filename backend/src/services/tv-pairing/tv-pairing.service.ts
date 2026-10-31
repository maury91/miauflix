import { logger } from '@logger';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { networkInterfaces } from 'os';

import type { ConfigurationService } from '@services/configuration/configuration.service';

const DEFAULT_ANNOUNCE_INTERVAL_MS = 120_000;
const ANNOUNCE_TIMEOUT_MS = 10_000;
/** The pairing service takes at most this many addresses per server. */
const MAX_ADDRESSES = 8;
/** Addresses the server was reached at are announced for this long after the last request. */
const REACHED_AT_TTL_MS = 24 * 60 * 60_000;

/** An IPv4 address of a private network (RFC 1918), as a TV on the same network would use. */
const PRIVATE_IPV4 =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

export interface TvPairingServiceOptions {
  /** In a container the interfaces are the container's own, which a TV can't reach. */
  inContainer?: boolean;
  interfaces?: typeof networkInterfaces;
  now?: () => number;
}

/**
 * Announces this server to the pairing service (TV_PAIRING_URL), so the Samsung TV app on the
 * same network finds it: the service hands the announced addresses to TVs behind the same
 * public IP, and forgets them once the announcements stop.
 *
 * The addresses are TV_PAIRING_ADDRESSES when set. Otherwise they are the server's private IPv4
 * addresses (outside a container) and the private IPv4 addresses it was reached at, from the
 * requests' Host header: in Docker, the one a browser on the network opened Miauflix at.
 */
export class TvPairingService {
  private readonly id = randomUUID();
  private readonly reachedAt = new Map<string, number>();
  private readonly inContainer: boolean;
  private readonly interfaces: typeof networkInterfaces;
  private readonly now: () => number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private lastAnnounced = '';

  constructor(
    private readonly configurationService: ConfigurationService,
    options: TvPairingServiceOptions = {}
  ) {
    this.inContainer = options.inContainer ?? existsSync('/.dockerenv');
    this.interfaces = options.interfaces ?? networkInterfaces;
    this.now = options.now ?? Date.now;
  }

  start(): void {
    this.stopped = false;
    void this.announce();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  /** Note the Host a request reached the server at; a new private address is announced now. */
  noteHost(host: string | undefined): void {
    const match = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(host ?? '');
    if (!match || !PRIVATE_IPV4.test(match[1])) return;
    const origin = `http://${match[1]}${match[2] && match[2] !== '80' ? `:${match[2]}` : ''}`;
    const known = this.reachedAt.has(origin);
    this.reachedAt.set(origin, this.now());
    if (!known && !this.stopped && !this.configuredAddresses()) void this.announce();
  }

  /** The addresses announced to TVs. */
  addresses(): string[] {
    const configured = this.configuredAddresses();
    if (configured) return configured.slice(0, MAX_ADDRESSES);

    const port = this.configurationService.get('PORT') ?? 3000;
    const own = this.inContainer
      ? []
      : Object.values(this.interfaces())
          .flat()
          .filter(info => info && info.family === 'IPv4' && !info.internal)
          .map(info => info!.address)
          .filter(address => PRIVATE_IPV4.test(address))
          .map(address => `http://${address}:${port}`);

    const oldest = this.now() - REACHED_AT_TTL_MS;
    for (const [origin, seen] of this.reachedAt) {
      if (seen < oldest) this.reachedAt.delete(origin);
    }
    const reached = [...this.reachedAt.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([origin]) => origin);

    return [...new Set([...reached, ...own])].slice(0, MAX_ADDRESSES);
  }

  private configuredAddresses(): string[] | null {
    const configured = (this.configurationService.get('TV_PAIRING_ADDRESSES') ?? [])
      .map((address: string) => address.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    return configured.length ? configured : null;
  }

  /** Announce now, then again when the pairing service asks (it forgets silent servers). */
  async announce(): Promise<void> {
    clearTimeout(this.timer);
    let nextMs = DEFAULT_ANNOUNCE_INTERVAL_MS;
    const enabled = this.configurationService.get('TV_PAIRING_ENABLED') !== false;
    const pairingUrl = this.configurationService.get('TV_PAIRING_URL')?.replace(/\/+$/, '');
    const urls = this.addresses();

    if (enabled && pairingUrl && urls.length) {
      try {
        const response = await fetch(`${pairingUrl}/v1/discovery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'server', id: this.id, urls }),
          signal: AbortSignal.timeout(ANNOUNCE_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`answered ${response.status}`);
        const body = (await response.json()) as { announceInterval?: unknown };
        if (typeof body.announceInterval === 'number' && body.announceInterval >= 30) {
          nextMs = body.announceInterval * 1000;
        }
        const announced = urls.join(', ');
        if (announced !== this.lastAnnounced) {
          logger.info('TvPairing', `Announced to ${pairingUrl} for TVs: ${announced}`);
          this.lastAnnounced = announced;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.debug('TvPairing', `Could not announce to ${pairingUrl}: ${message}`);
      }
    }
    if (!this.stopped) this.timer = setTimeout(() => void this.announce(), nextMs);
  }
}
