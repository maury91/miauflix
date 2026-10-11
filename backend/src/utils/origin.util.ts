/** Match origins while treating loopback hostnames as equivalent. */
export function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  // A wildcard is unrestricted only when it is the complete allowlist. A
  // mixed list must remain restrictive for both HTTP and WebSocket callers.
  if (allowedOrigins.length === 1 && allowedOrigins[0] === '*') return true;

  let candidate: URL;
  try {
    candidate = new URL(origin);
  } catch {
    return false;
  }

  return allowedOrigins.some(allowed => {
    if (allowed.includes('*')) {
      const wildcard = /^(?:(https?):\/\/)?\*\.([^/:]+)(?::(\d+))?$/.exec(allowed);
      if (!wildcard) return false;
      const [, protocol, domain, port] = wildcard;
      const expectedProtocol = protocol ? `${protocol}:` : 'https:';
      const defaultPort = expectedProtocol === 'https:' ? '443' : '80';
      const expectedPort = port ?? defaultPort;
      return (
        candidate.protocol === expectedProtocol &&
        (candidate.port || defaultPort) === expectedPort &&
        (candidate.hostname === domain || candidate.hostname.endsWith(`.${domain}`))
      );
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
