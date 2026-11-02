export function normalizeHash(value: string): string | null {
  const raw = value.trim().toLowerCase();
  if (/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(raw)) return raw;
  if (/^[a-z2-7]{32}$/.test(raw)) {
    let bits = 0,
      acc = 0;
    const bytes: number[] = [];
    for (const char of raw.toUpperCase()) {
      acc = (acc << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((acc >>> bits) & 255);
      }
    }
    return Buffer.from(bytes).toString('hex');
  }
  return null;
}
export function magnetHash(magnet?: string): string | null {
  try {
    const params = new URL(magnet ?? '').searchParams;
    for (const xt of params.getAll('xt')) {
      const hash = normalizeHash(xt.replace(/^urn:btih:/i, '').replace(/^urn:btmh:1220/i, ''));
      if (hash) return hash;
    }
  } catch {
    /* Invalid magnet. */
  }
  return null;
}
export function buildMagnet(hash: string, name: string, magnet?: string): string {
  const params = new URLSearchParams({
    xt: hash.length === 64 ? `urn:btmh:1220${hash}` : `urn:btih:${hash}`,
    dn: name,
  });
  const trackers = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
  ];
  try {
    trackers.push(...new URL(magnet ?? '').searchParams.getAll('tr'));
  } catch {
    /* No input magnet. */
  }
  for (const tr of new Set(trackers)) params.append('tr', tr);
  return `magnet:?${params}`;
}
