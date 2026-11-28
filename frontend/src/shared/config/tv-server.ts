/** Where the TV app keeps the server it was connected to (the app's own storage). */
const TV_SERVER_KEY = 'miauwatch.tv.server';

/** The server picked on the TV, or null before one is. */
export function readTvServer(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(TV_SERVER_KEY);
  } catch {
    return null;
  }
}

/**
 * The server the TV app was packaged with, or '' for none. Read from `window.API_URL`, which
 * index.html sets in plain text, so an installer can rewrite it in a built package (Apps2Samsung's
 * user settings look for `window.API_URL = '/';`); the build-time value is the fallback.
 */
export function packagedTvServer(buildTime: string): string {
  const fromPage = typeof window === 'undefined' ? undefined : window.API_URL?.trim();
  for (const candidate of [fromPage, buildTime]) {
    if (candidate && /^https?:\/\/[^/]+/.test(candidate)) return candidate.replace(/\/+$/, '');
  }
  return '';
}

export function writeTvServer(url: string | null): void {
  if (url) window.localStorage.setItem(TV_SERVER_KEY, url);
  else window.localStorage.removeItem(TV_SERVER_KEY);
}
