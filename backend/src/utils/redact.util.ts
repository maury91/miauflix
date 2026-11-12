/**
 * Strip secrets from request data before it is stored (audit log). Tokens travel in some paths
 * (`/api/stream/<token>`, `/api/auth/qr/<approvalToken>`), query values (`?streamingKey=`) and
 * headers (`X-Refresh-Token`), so only known-safe headers are kept and those spots are masked.
 */

export const REDACTED = 'REDACTED';

/** Headers worth keeping in the audit log; every other header is dropped. */
const LOGGED_HEADERS = new Set([
  'accept',
  'accept-language',
  'content-length',
  'content-type',
  'host',
  'origin',
  'referer',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'user-agent',
  'x-auth-transport',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'x-session-id',
]);

/** Path segments that follow these prefixes are secrets. */
const SECRET_PATH_SEGMENTS = [/^(\/api\/stream\/)[^/]+/, /^(\/api\/auth\/qr\/)[^/]+/];

/** Query keys whose values are secrets (`streamingKey`, `token`, `code`, ...). */
const SECRET_QUERY_KEY = /token|key|secret|password|code|signature|sig$/i;

export function redactPath(path: string): string {
  for (const pattern of SECRET_PATH_SEGMENTS) {
    if (pattern.test(path)) return path.replace(pattern, `$1${REDACTED}`);
  }
  return path;
}

export function redactQuery(searchParams: URLSearchParams): Record<string, string> {
  const query: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    query[key] = SECRET_QUERY_KEY.test(key) ? REDACTED : value;
  });
  return query;
}

/** A URL with its secret path segment and query values masked; unparsable input is dropped. */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.pathname = redactPath(url.pathname);
    url.searchParams.forEach((_, key) => {
      if (SECRET_QUERY_KEY.test(key)) url.searchParams.set(key, REDACTED);
    });
    url.hash = '';
    return url.toString();
  } catch {
    return REDACTED;
  }
}

export function redactHeaders(headers: Headers): Record<string, string> {
  const logged: Record<string, string> = {};
  headers.forEach((value, key) => {
    const name = key.toLowerCase();
    if (!LOGGED_HEADERS.has(name)) return;
    logged[name] = name === 'referer' ? redactUrl(value) : value;
  });
  return logged;
}
