import { RateLimiter } from './rate-limit';

/**
 * Lets a Miauflix TV app find the Miauflix servers on its network.
 *
 * One endpoint, `POST /v1/discovery`:
 * - `{ role: 'server', id, urls, name? }`: a server announces the addresses it can be reached at
 *   on its local network, and repeats it every `announceInterval` seconds;
 * - `{ role: 'client' }`: a TV gets the servers announced from its own public IP.
 *
 * Servers and TVs behind the same router share a public IP, so that is what matches them; an
 * IPv6 client is matched by its /64. Announcements are dropped once they are older than the TTL,
 * and they live in memory only.
 */

const MAX_URLS = 8;
const MAX_URL_LENGTH = 256;
const MAX_NAME_LENGTH = 64;
const MAX_BODY_BYTES = 4096;
const SERVER_ID = /^[A-Za-z0-9_-]{8,64}$/;

export interface AnnouncedServer {
  id: string;
  urls: string[];
  name?: string;
  /** ISO time of the last announcement. */
  lastSeen: string;
}

interface Announcement {
  urls: string[];
  name?: string;
  lastSeen: number;
}

export interface DiscoveryAppOptions {
  /** How long an announcement counts. */
  ttlMs?: number;
  /** How often servers are told to announce again, in seconds. */
  announceIntervalSeconds?: number;
  /** Servers kept per network; the longest silent is dropped beyond it. */
  maxServersPerNetwork?: number;
  /** Networks kept at once; new ones get 503 beyond it. */
  maxNetworks?: number;
  /** Requests per network and minute. */
  requestsPerMinute?: number;
  now?: () => number;
}

const corsHeaders = {
  // The TV app runs from local files; nothing here uses cookies.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function error(status: number, message: string): Response {
  return json({ error: message }, status);
}

/**
 * What matches a TV with its servers: an IPv4 address as it is (an IPv4-mapped IPv6 one too),
 * an IPv6 address by its /64, which a home network gets as a whole.
 */
export function networkKey(ip: string): string {
  const address = ip.replace(/%.*$/, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1];
  if (!address.includes(':')) return address;
  const [head = '', tail = ''] = address.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const groups = address.includes('::')
    ? [
        ...headGroups,
        ...Array<string>(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill('0'),
        ...tailGroups,
      ]
    : headGroups;
  const prefix = groups
    .slice(0, 4)
    .map(group => group.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':');
  return `${prefix}::/64`;
}

/** The server's origin when `value` is a plain http(s) origin (an optional trailing slash). */
export function normalizeServerUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const plainOrigin =
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    !url.username &&
    !url.password &&
    url.pathname === '/' &&
    !url.search &&
    !url.hash;
  return plainOrigin ? url.origin : null;
}

async function readJson(request: Request): Promise<Record<string, unknown> | undefined> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function createDiscoveryApp(options: DiscoveryAppOptions = {}) {
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const announceInterval = options.announceIntervalSeconds ?? 120;
  const maxServersPerNetwork = options.maxServersPerNetwork ?? 16;
  const maxNetworks = options.maxNetworks ?? 100_000;
  const now = options.now ?? Date.now;
  const limiter = new RateLimiter(options.requestsPerMinute ?? 30, 60_000, now);
  /** Network key → server id → its latest announcement. */
  const networks = new Map<string, Map<string, Announcement>>();

  /** The live announcements of a network; stale ones are dropped. */
  const live = (network: string): Map<string, Announcement> | undefined => {
    const servers = networks.get(network);
    if (!servers) return undefined;
    const time = now();
    for (const [id, announcement] of servers) {
      if (announcement.lastSeen + ttlMs <= time) servers.delete(id);
    }
    if (servers.size === 0) {
      networks.delete(network);
      return undefined;
    }
    return servers;
  };

  const announce = (network: string, body: Record<string, unknown>): Response => {
    const id = typeof body['id'] === 'string' && SERVER_ID.test(body['id']) ? body['id'] : null;
    if (!id) return error(400, 'id must be 8 to 64 letters, digits, _ or -');
    const rawUrls = Array.isArray(body['urls']) ? body['urls'] : [];
    const urls = [...new Set(rawUrls.map(normalizeServerUrl))].filter(
      (url): url is string => url !== null
    );
    if (urls.length === 0 || urls.length > MAX_URLS || urls.length !== rawUrls.length) {
      return error(400, `urls must be 1 to ${MAX_URLS} http(s) origins`);
    }
    const name =
      typeof body['name'] === 'string' && body['name'].trim()
        ? body['name'].trim().slice(0, MAX_NAME_LENGTH)
        : undefined;

    let servers = live(network);
    if (!servers) {
      if (networks.size >= maxNetworks) return error(503, 'Too many networks, try again later');
      servers = new Map();
      networks.set(network, servers);
    }
    servers.delete(id);
    // A Map keeps insertion order: the first entry is the one silent the longest
    while (servers.size >= maxServersPerNetwork) servers.delete(servers.keys().next().value!);
    servers.set(id, name ? { urls, name, lastSeen: now() } : { urls, lastSeen: now() });
    return json({ announceInterval });
  };

  const lookup = (network: string): Response => {
    const servers: AnnouncedServer[] = [...(live(network) ?? new Map<string, Announcement>())]
      .map(([id, { urls, name, lastSeen }]) => ({
        id,
        urls,
        ...(name ? { name } : {}),
        lastSeen: new Date(lastSeen).toISOString(),
      }))
      .reverse();
    return json({ servers });
  };

  return {
    /** Handle a request from `clientIp`, the address servers and TVs are matched by. */
    async fetch(request: Request, clientIp: string): Promise<Response> {
      const { pathname } = new URL(request.url);
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
      if (pathname === '/health' && request.method === 'GET') return json({ status: 'ok' });
      if (pathname !== '/v1/discovery') return error(404, 'Not found');
      if (request.method !== 'POST') return error(405, 'Use POST');

      const network = networkKey(clientIp);
      if (!limiter.take(network)) return error(429, 'Too many requests');
      const body = await readJson(request);
      if (body?.['role'] === 'server') return announce(network, body);
      if (body?.['role'] === 'client') return lookup(network);
      return error(400, "role must be 'server' or 'client'");
    },

    /** Drop stale announcements and finished rate-limit windows. */
    sweep(): void {
      for (const network of [...networks.keys()]) live(network);
      limiter.sweep();
    },

    get networks(): number {
      return networks.size;
    },
  };
}
