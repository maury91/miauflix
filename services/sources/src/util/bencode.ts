import { createHash } from 'node:crypto';

const digit = (byte: number | undefined) => byte !== undefined && byte >= 48 && byte <= 57;

/** Offset just past the bencoded value starting at `start`; null when malformed. */
function skip(bytes: Uint8Array, start: number, depth = 0): number | null {
  if (depth > 32 || start >= bytes.length) return null;
  const head = bytes[start];
  if (head === 0x69) {
    // i<digits>e
    let i = start + 1;
    if (bytes[i] === 0x2d) i++;
    const first = i;
    while (digit(bytes[i])) i++;
    return i > first && bytes[i] === 0x65 ? i + 1 : null;
  }
  if (head === 0x6c || head === 0x64) {
    let i = start + 1;
    while (bytes[i] !== 0x65) {
      const next = skip(bytes, i, depth + 1);
      if (next === null) return null;
      i = next;
    }
    return i + 1;
  }
  if (digit(head)) {
    let i = start;
    while (digit(bytes[i])) i++;
    if (bytes[i] !== 0x3a || i - start > 10) return null;
    const end = i + 1 + Number(Buffer.from(bytes.subarray(start, i)).toString());
    return end <= bytes.length ? end : null;
  }
  return null;
}

/** SHA-1 info-hash of a .torrent file, or null when it is not a valid v1 torrent. */
export function torrentInfoHash(bytes: Uint8Array): string | null {
  if (bytes[0] !== 0x64) return null;
  let i = 1;
  while (i < bytes.length && bytes[i] !== 0x65) {
    const keyEnd = skip(bytes, i);
    if (keyEnd === null || !digit(bytes[i])) return null;
    const colon = bytes.indexOf(0x3a, i);
    const key = Buffer.from(bytes.subarray(colon + 1, keyEnd)).toString('latin1');
    const valueEnd = skip(bytes, keyEnd);
    if (valueEnd === null) return null;
    if (key === 'info') {
      if (bytes[keyEnd] !== 0x64) return null;
      return createHash('sha1').update(bytes.subarray(keyEnd, valueEnd)).digest('hex');
    }
    i = valueEnd;
  }
  return null;
}
