/**
 * Log redaction for anything that ties a server to a torrent. Logs end up in `docker logs` on the
 * host, so an info hash or magnet link there names what was downloaded. Every service logger runs
 * its output through this; log by source id instead of identifiers in the first place.
 *
 * Patterns, not knowledge of the values: they also catch identifiers inside library errors and
 * URLs (a `.torrent` download URL carries the hash). Release names and file paths cannot be
 * recognised this way, so they must never be logged.
 */

const REDACTED = '[redacted]';

/** Magnet links, up to the end of the URI (a backslash ends it too, so JSON stays valid). */
const MAGNET = /magnet:\?[^\s"'<>`\\]*/gi;
/** BitTorrent v1 info hashes as hex (40), v2 / multihash as hex (64 or 68). */
const HEX_HASH = /(?<![0-9a-f])(?:[0-9a-f]{68}|[0-9a-f]{64}|[0-9a-f]{40})(?![0-9a-f])/gi;
/** v1 info hashes in base32 (32), as in older magnet links. */
const BASE32_HASH = /(?<![a-z2-7])[a-z2-7]{32}(?![a-z2-7])/gi;

/** The text with every magnet link and info hash replaced by `[redacted]`. */
export const redactSourceIdentifiers = (text: string): string =>
  text.replace(MAGNET, REDACTED).replace(HEX_HASH, REDACTED).replace(BASE32_HASH, REDACTED);

/**
 * One logger argument, redacted: strings directly; errors as a copy with the message, stack and
 * cause redacted (keeping the name); other objects through JSON. Values that cannot be serialised
 * are dropped rather than logged unredacted.
 */
export const redactLogArgument = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') return redactSourceIdentifiers(value);
  if (value instanceof Error) {
    const copy = new Error(redactSourceIdentifiers(value.message));
    copy.name = value.name;
    copy.stack = value.stack === undefined ? undefined : redactSourceIdentifiers(value.stack);
    if (value.cause !== undefined && depth < 5)
      copy.cause = redactLogArgument(value.cause, depth + 1);
    // Extra fields such as `status`, redacted the same way (keys too); the ones above are already
    // handled. A throwing getter drops the extra fields rather than the whole log line.
    const extra: Record<string, unknown> = {};
    try {
      for (const [key, field] of Object.entries(value)) {
        if (key === 'name' || key === 'message' || key === 'stack' || key === 'cause') continue;
        extra[redactSourceIdentifiers(key)] =
          depth < 5 ? redactLogArgument(field, depth + 1) : '[unloggable value]';
      }
    } catch {
      return Object.assign(copy, { fields: '[unloggable value]' });
    }
    return Object.assign(copy, extra);
  }
  if (value !== null && typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json === undefined ? value : JSON.parse(redactSourceIdentifiers(json));
    } catch {
      return '[unloggable value]';
    }
  }
  return value;
};
