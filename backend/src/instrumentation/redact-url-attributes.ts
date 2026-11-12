import type { Attributes } from '@opentelemetry/api';

import { redactPath, redactQuery, redactUrl } from '@utils/redact.util';

/** Span attributes holding a full URL, and ones holding a path with its query. */
const URL_ATTRIBUTES = ['url.full', 'http.url'];
const PATH_ATTRIBUTES = ['http.target', 'url.path'];

/** A query string (without `?`) with secret values masked. */
function redactQueryString(query: string): string {
  return new URLSearchParams(redactQuery(new URLSearchParams(query))).toString();
}

/** URL attributes of `attributes` with stream and QR tokens masked (see `redactUrl`). */
export function redactUrlAttributes(attributes: Attributes): Attributes {
  const redacted: Attributes = {};
  for (const name of URL_ATTRIBUTES) {
    const value = attributes[name];
    if (typeof value === 'string') redacted[name] = redactUrl(value);
  }
  for (const name of PATH_ATTRIBUTES) {
    const value = attributes[name];
    if (typeof value !== 'string') continue;
    const queryStart = value.indexOf('?');
    redacted[name] =
      queryStart === -1
        ? redactPath(value)
        : `${redactPath(value.slice(0, queryStart))}?${redactQueryString(value.slice(queryStart + 1))}`;
  }
  const query = attributes['url.query'];
  if (typeof query === 'string') redacted['url.query'] = redactQueryString(query);
  return redacted;
}
