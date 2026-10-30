import { createHmac, timingSafeEqual } from 'node:crypto';

import { BYTES_PATH } from './protocol.js';

/**
 * Signed `bytes` URLs: `/_b/<method>?t=<input>.<exp>.<sig>`, where `sig` is an HMAC-SHA256 over the
 * method, the input and the expiry. The caller mints them without a round trip; the service checks
 * them without calling back.
 */

const DEFAULT_TTL_SECONDS = 6 * 60 * 60;

const sign = (key: string, method: string, payload: string, exp: number): string =>
  createHmac('sha256', key).update(`${method}\n${payload}\n${exp}`).digest('base64url');

export const signedBytesPath = (
  key: string,
  method: string,
  input: unknown,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  now = Date.now()
): string => {
  const payload = Buffer.from(JSON.stringify(input ?? null)).toString('base64url');
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return `${BYTES_PATH}${method}?t=${payload}.${exp}.${sign(key, method, payload, exp)}`;
};

export type TicketCheck =
  | { ok: true; input: unknown }
  | { ok: false; reason: 'invalid' | 'expired' };

export const verifyTicket = (
  key: string,
  method: string,
  ticket: string,
  now = Date.now()
): TicketCheck => {
  const [payload, rawExp, signature] = ticket.split('.');
  const exp = Number(rawExp);
  if (!payload || !signature || !Number.isSafeInteger(exp)) return { ok: false, reason: 'invalid' };
  const expected = Buffer.from(sign(key, method, payload, exp));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return { ok: false, reason: 'invalid' };
  if (exp * 1000 < now) return { ok: false, reason: 'expired' };
  try {
    return { ok: true, input: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
};
