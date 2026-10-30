import type { AuthTokens } from '@miauflix/backend';

/**
 * Session tokens for the Samsung TV build. The TV app runs from local files, so the backend is
 * cross-site to it and its HttpOnly cookies never come back. The TV asks for token transport
 * instead: the backend returns the tokens in the body, refresh tokens are kept in the app's own
 * storage (private to the installed app) and access tokens in memory, and they are sent back as
 * headers. The existing refresh-on-401 flow restores an access token after a restart.
 */

const REFRESH_TOKENS_KEY = 'miauflix.tv.refreshTokens';
/** `GET /api/auth/sessions` checks at most this many refresh tokens (see AuthService). */
const MAX_LISTED_SESSIONS = 5;
const accessTokens = new Map<string, string>();

function readRefreshTokens(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(REFRESH_TOKENS_KEY) ?? '{}');
    return value && typeof value === 'object' ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeRefreshTokens(tokens: Record<string, string>): void {
  window.localStorage.setItem(REFRESH_TOKENS_KEY, JSON.stringify(tokens));
}

function storeTokens(session: string, { accessToken, refreshToken }: AuthTokens): void {
  accessTokens.set(session, accessToken);
  writeRefreshTokens({ ...readRefreshTokens(), [session]: refreshToken });
}

function forgetSession(session: string): void {
  accessTokens.delete(session);
  const refreshTokens = readRefreshTokens();
  delete refreshTokens[session];
  writeRefreshTokens(refreshTokens);
}

/** The access token of a session, for the realtime socket, which cannot send headers. */
export function getTvAccessToken(session: string): string | undefined {
  return accessTokens.get(session);
}

/**
 * Forget the sent sessions the backend did not list: their refresh token is invalid or their user
 * is gone. Left in place they would keep taking the slots the backend checks, hiding valid ones.
 * A session whose token was replaced while the request was in flight (a refresh) is kept.
 */
async function forgetUnlistedSessions(
  response: Response,
  sentPairs: [string, string][]
): Promise<void> {
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  if (!Array.isArray(body)) return;
  const listed = new Set(
    body.map((entry: { session?: unknown }) => entry?.session).filter(Boolean)
  );
  const stored = readRefreshTokens();
  sentPairs
    .filter(
      ([session, token]: [string, string]) => !listed.has(session) && stored[session] === token
    )
    .forEach(([session]: [string, string]) => forgetSession(session));
}

function requestUrl(input: RequestInfo | URL): URL {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new URL(url, window.location.href);
}

/** `fetch` for the backend client: adds the token headers and keeps the tokens it gets back. */
export const tvAuthFetch: typeof fetch = async (input, init) => {
  const { pathname } = requestUrl(input);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
  headers.set('X-Auth-Transport', 'token');

  const session = headers.get('X-Session-Id');
  const accessToken = session ? accessTokens.get(session) : undefined;
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const sessionAction = /\/api\/auth\/(refresh|logout)\/([^/]+)$/.exec(pathname);
  const actionSession = sessionAction ? decodeURIComponent(sessionAction[2]) : null;
  if (actionSession) {
    const refreshToken = readRefreshTokens()[actionSession];
    if (refreshToken) headers.set('X-Refresh-Token', refreshToken);
  }
  const listsSessions = pathname.endsWith('/api/auth/sessions');
  // The pairs as sent, so the ones the backend rejects can be dropped afterwards
  const sentPairs = listsSessions
    ? Object.entries(readRefreshTokens()).slice(0, MAX_LISTED_SESSIONS)
    : [];
  if (sentPairs.length) {
    headers.set(
      'X-Refresh-Tokens',
      sentPairs.map(([key, token]: [string, string]) => `${key}:${token}`).join(',')
    );
  }

  const response = await fetch(input, { ...init, headers, credentials: 'omit' });

  if (sentPairs.length && response.ok) {
    await forgetUnlistedSessions(response, sentPairs);
  }

  if (sessionAction?.[1] === 'logout' || (sessionAction && response.status === 401)) {
    forgetSession(actionSession!);
  }
  if (response.ok && /\/api\/auth\/(login|setup|refresh\/[^/]+|qr\/[^/]+\/claim)$/.test(pathname)) {
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { session?: string; tokens?: AuthTokens } | null;
    const tokenSession = body?.session ?? actionSession;
    if (body?.tokens && tokenSession) storeTokens(tokenSession, body.tokens);
  }
  return response;
};
