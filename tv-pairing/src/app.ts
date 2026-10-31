import { timingSafeEqual } from 'node:crypto';

import { RateLimiter } from './rate-limit';

/**
 * Pairs a Miauflix TV app with a Miauflix server it cannot find on its own.
 *
 * 1. The TV creates a pairing (`POST /v1/pairings`) and shows its code; it keeps the secret.
 * 2. Someone signed in to their server enters the code, and the server stores the address the TV
 *    should use (`PUT /v1/pairings/:code`).
 * 3. The TV polls with its secret (`GET /v1/pairings/:code`) and gets that address once, which
 *    deletes the pairing.
 *
 * Pairings live in memory only and expire after a few minutes: nothing is kept about the TV or
 * the server once the TV has its address.
 */

/** 32 symbols without 0/O and 1/I, so a byte maps to one evenly (256 / 32). */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 8;
const MAX_BODY_BYTES = 1024;
const MAX_URL_LENGTH = 256;
const MAX_NAME_LENGTH = 64;

export interface PairedServer {
  url: string;
  name?: string;
}

interface Pairing {
  secret: string;
  expiresAt: number;
  server?: PairedServer;
}

export interface PairingAppOptions {
  /** How long a code is valid. */
  ttlMs?: number;
  /** How often the TV is told to poll, in seconds. */
  pollIntervalSeconds?: number;
  /** Open pairings at most; new ones get 503 beyond it. */
  maxPairings?: number;
  /** Requests per client IP and minute, per kind. */
  limits?: { create?: number; complete?: number; poll?: number };
  now?: () => number;
}

const corsHeaders = {
  // The TV app runs from local files, and servers call from anywhere; nothing here uses cookies.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
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

function randomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(CODE_LENGTH)))
    .map(byte => CODE_ALPHABET[byte % CODE_ALPHABET.length])
    .join('');
}

function randomSecret(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

/** The code as typed (any case, with spaces or dashes), or null when it can't be one. */
export function normalizeCode(code: string): string | null {
  const normalized = code.toUpperCase().replace(/[\s-]/g, '');
  if (normalized.length !== CODE_LENGTH) return null;
  return [...normalized].every(char => CODE_ALPHABET.includes(char)) ? normalized : null;
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

function secretsMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createPairingApp(options: PairingAppOptions = {}) {
  const ttlMs = options.ttlMs ?? 10 * 60_000;
  const pollInterval = options.pollIntervalSeconds ?? 3;
  const maxPairings = options.maxPairings ?? 10_000;
  const now = options.now ?? Date.now;
  const limiters = {
    create: new RateLimiter(options.limits?.create ?? 10, 60_000, now),
    // Each attempt counts, so codes can't be guessed: 2^40 of them, a few tries a minute
    complete: new RateLimiter(options.limits?.complete ?? 10, 60_000, now),
    poll: new RateLimiter(options.limits?.poll ?? 120, 60_000, now),
  };
  const pairings = new Map<string, Pairing>();

  /** The live pairing for a code; an expired one is dropped. */
  const find = (code: string): Pairing | undefined => {
    const pairing = pairings.get(code);
    if (pairing && pairing.expiresAt <= now()) {
      pairings.delete(code);
      return undefined;
    }
    return pairing;
  };

  const create = (): Response => {
    if (pairings.size >= maxPairings) return error(503, 'Too many open pairings, try again later');
    let code = randomCode();
    while (pairings.has(code)) code = randomCode();
    const pairing: Pairing = { secret: randomSecret(), expiresAt: now() + ttlMs };
    pairings.set(code, pairing);
    return json(
      {
        code,
        secret: pairing.secret,
        expiresAt: new Date(pairing.expiresAt).toISOString(),
        pollInterval,
      },
      201
    );
  };

  const complete = async (code: string, request: Request): Promise<Response> => {
    const body = (await readJson(request)) as { url?: unknown; name?: unknown } | undefined;
    const url = normalizeServerUrl(body?.url);
    if (!url) return error(400, 'url must be an http(s) origin, like http://192.168.1.10:3000');
    const name =
      typeof body?.name === 'string' && body.name.trim()
        ? body.name.trim().slice(0, MAX_NAME_LENGTH)
        : undefined;
    const pairing = find(code);
    if (!pairing) return error(404, 'Unknown or expired code');
    if (pairing.server) return error(409, 'This code was already used');
    pairing.server = name ? { url, name } : { url };
    return new Response(null, { status: 204, headers: corsHeaders });
  };

  const poll = (code: string, request: Request): Response => {
    const secret = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
    const pairing = find(code);
    // Same answer for a wrong secret as for no pairing: the code alone reveals nothing
    if (!pairing || !secret || !secretsMatch(pairing.secret, secret)) {
      return error(404, 'Unknown or expired code');
    }
    if (!pairing.server) return json({ status: 'pending' }, 202);
    pairings.delete(code);
    return json({ status: 'paired', server: pairing.server });
  };

  return {
    /** Handle a request from `clientIp`, which rate limits are kept for. */
    async fetch(request: Request, clientIp: string): Promise<Response> {
      const { pathname } = new URL(request.url);
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
      if (pathname === '/health' && request.method === 'GET') return json({ status: 'ok' });

      if (pathname === '/v1/pairings' && request.method === 'POST') {
        return limiters.create.take(clientIp) ? create() : error(429, 'Too many requests');
      }
      const match = /^\/v1\/pairings\/([^/]+)$/.exec(pathname);
      if (match && (request.method === 'PUT' || request.method === 'GET')) {
        const limiter = request.method === 'PUT' ? limiters.complete : limiters.poll;
        if (!limiter.take(clientIp)) return error(429, 'Too many requests');
        const code = normalizeCode(decodeURIComponent(match[1]));
        if (!code) return error(404, 'Unknown or expired code');
        return request.method === 'PUT' ? complete(code, request) : poll(code, request);
      }
      return error(404, 'Not found');
    },

    /** Drop expired pairings and finished rate-limit windows. */
    sweep(): void {
      const time = now();
      for (const [code, pairing] of pairings) {
        if (pairing.expiresAt <= time) pairings.delete(code);
      }
      Object.values(limiters).forEach(limiter => limiter.sweep());
    },

    get size(): number {
      return pairings.size;
    },
  };
}
