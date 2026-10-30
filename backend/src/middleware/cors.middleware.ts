import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';

import {
  AUTH_TRANSPORT_HEADER,
  REFRESH_TOKEN_HEADER,
  REFRESH_TOKENS_HEADER,
} from '@utils/auth-transport.util';
import { isTvAppOrigin } from '@utils/origin.util';

const allowMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

/**
 * CORS for the configured browser origins (with credentials, for the session cookies) and, while
 * `allowTvApp()` holds, for the Samsung TV app's local origin. The TV app authenticates with
 * headers, so it is allowed without credentials: a page that only shares its opaque origin gets
 * no cookies and no tokens out of this.
 */
export const createCorsMiddleware = (
  origins: string[],
  allowTvApp: () => boolean | undefined
): MiddlewareHandler => {
  const browserCors = cors({
    origin: origins,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Session-Id'],
    allowMethods,
    credentials: origins.length !== 1 || origins[0] !== '*',
  });
  const tvAppCors = cors({
    origin: origin => origin,
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Session-Id',
      AUTH_TRANSPORT_HEADER,
      REFRESH_TOKEN_HEADER,
      REFRESH_TOKENS_HEADER,
    ],
    allowMethods,
    credentials: false,
  });

  return (context, next) =>
    allowTvApp() && isTvAppOrigin(context.req.header('origin'))
      ? tvAppCors(context, next)
      : browserCors(context, next);
};
