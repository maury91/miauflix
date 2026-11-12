import type { Attributes } from '@opentelemetry/api';

import { redactUrl } from '@utils/redact.util';

/** Span attributes holding a full URL, and ones holding a path with its query. */
const URL_ATTRIBUTES = ['url.full', 'http.url'];
const PATH_ATTRIBUTES = ['http.target', 'url.path'];
const PLACEHOLDER_ORIGIN = 'http://placeholder.invalid';

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
    const url = redactUrl(`${PLACEHOLDER_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`);
    redacted[name] = url.startsWith(PLACEHOLDER_ORIGIN)
      ? url.slice(PLACEHOLDER_ORIGIN.length)
      : url;
  }
  const query = attributes['url.query'];
  if (typeof query === 'string') {
    redacted['url.query'] = new URL(redactUrl(`${PLACEHOLDER_ORIGIN}/?${query}`)).search.slice(1);
  }
  return redacted;
}
