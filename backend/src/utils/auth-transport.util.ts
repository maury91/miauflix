import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';

/**
 * Clients that cannot use the session cookies (the Samsung TV app runs from local files, so the
 * backend is cross-site to it) ask for the tokens in the response body with this header and
 * send them back in the headers below. Browsers keep the HttpOnly cookies.
 */
export const AUTH_TRANSPORT_HEADER = 'X-Auth-Transport';
export const REFRESH_TOKEN_HEADER = 'X-Refresh-Token';
/** `session:token` pairs, comma-separated, for listing the sessions a client holds. */
export const REFRESH_TOKENS_HEADER = 'X-Refresh-Tokens';

export function wantsTokenTransport(context: Context): boolean {
  return context.req.header(AUTH_TRANSPORT_HEADER) === 'token';
}

/** The access token from the session cookie, or else from `Authorization: Bearer`. */
export function readAccessToken(context: Context, cookieName: string): string | undefined {
  const cookie = getCookie(context, cookieName);
  if (cookie) return cookie;
  const bearer = /^Bearer ([^\s]+)$/.exec(context.req.header('Authorization') ?? '');
  return bearer?.[1];
}

/** The refresh token from the session cookie, or else from `X-Refresh-Token`. */
export function readRefreshToken(context: Context, cookieName: string): string | undefined {
  return getCookie(context, cookieName) || context.req.header(REFRESH_TOKEN_HEADER) || undefined;
}

/** The `session:token` pairs a token-transport client sent in `X-Refresh-Tokens`. */
export function readRefreshTokenPairs(context: Context): { session: string; token: string }[] {
  return (context.req.raw.headers.get(REFRESH_TOKENS_HEADER) ?? '')
    .split(',')
    .flatMap(pair => {
      const index = pair.indexOf(':');
      if (index < 0) return [];
      return [{ session: pair.slice(0, index).trim(), token: pair.slice(index + 1).trim() }];
    })
    .filter(({ session, token }) => session && token);
}
