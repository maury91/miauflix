/** Where the TV app keeps the server it was connected to (the app's own storage). */
const TV_SERVER_KEY = 'miauflix.tv.server';

/** The server picked on the TV, or null before one is. */
export function readTvServer(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(TV_SERVER_KEY);
  } catch {
    return null;
  }
}

export function writeTvServer(url: string | null): void {
  if (url) window.localStorage.setItem(TV_SERVER_KEY, url);
  else window.localStorage.removeItem(TV_SERVER_KEY);
}
