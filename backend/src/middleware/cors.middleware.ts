import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';

import {
  AUTH_TRANSPORT_HEADER,
  REFRESH_TOKEN_HEADER,
  REFRESH_TOKENS_HEADER,
} from '@utils/auth-transport.util';

const allowMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

/**
 * CORS for the configured browser origins (with credentials, for the session cookies) and for the
 * Samsung TV app's local origin, as `isTvApp` decides. The TV app authenticates with headers, so
 * it is allowed without credentials: a page sharing its origin gets no cookies out of this.
 */
export const createCorsMiddleware = (
  origins: string[],
  isTvApp: (origin: string | undefined) => boolean
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
    isTvApp(context.req.header('origin')) ? tvAppCors(context, next) : browserCors(context, next);
};
