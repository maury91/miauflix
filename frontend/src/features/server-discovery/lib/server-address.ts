/** The port a Miauflix server listens on unless configured otherwise (PORT). */
export const DEFAULT_SERVER_PORT = 3000;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * The server origin for an address as typed on the TV: `192.168.1.10` becomes
 * `http://192.168.1.10:3000` (a bare IP gets the default port), a name without scheme gets
 * `http://`, and any path is dropped. Null when it can't be an address.
 */
export function normalizeServerAddress(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  if (!url.port && IPV4.test(url.hostname) && !/^https?:\/\/[^/]+:\d/.test(withScheme)) {
    url.port = String(DEFAULT_SERVER_PORT);
  }
  return url.origin;
}

/** The address without the scheme, as shown on the TV. */
export function displayServerAddress(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
