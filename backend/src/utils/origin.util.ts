/** Match origins while treating loopback hostnames as equivalent. */
export function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes('*')) return true;

  let candidate: URL;
  try {
    candidate = new URL(origin);
  } catch {
    return false;
  }

  return allowedOrigins.some(allowed => {
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      return candidate.hostname === domain || candidate.hostname.endsWith(`.${domain}`);
    }
    try {
      const configured = new URL(allowed);
      const loopback =
        (configured.hostname === 'localhost' || configured.hostname === '127.0.0.1') &&
        (candidate.hostname === 'localhost' || candidate.hostname === '127.0.0.1');
      return (
        configured.protocol === candidate.protocol &&
        configured.port === candidate.port &&
        (configured.hostname === candidate.hostname || loopback)
      );
    } catch {
      return false;
    }
  });
}

export function expandEquivalentOrigins(origins: string[]): string[] {
  const expanded = new Set(origins);
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') continue;
      const equivalent = new URL(url.toString());
      equivalent.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
      expanded.add(equivalent.origin);
    } catch {
      // Invalid configured origins are ignored by the matcher and CORS adapter.
    }
  }
  return [...expanded];
}
