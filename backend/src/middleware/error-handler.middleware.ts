import { logger } from '@logger';
import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { UserRole } from '@entities/user.entity';
import { describeError, newErrorId } from '@errors/error-response';

/**
 * Answers every error a route throws with the standard error body (`ApiErrorBody`), and logs it
 * with an id that the response carries in `X-Error-Id`.
 */
export const handleError: ErrorHandler = (err, c) => {
  const errorId = newErrorId();
  const role = (c as { get(key: string): { user?: { role?: string } } | undefined }).get(
    'sessionInfo'
  )?.user?.role;
  const { status, body, expected } = describeError(err, {
    errorId,
    includeDetail: role === UserRole.ADMIN,
  });
  // Stream and QR paths carry secret tokens: keep their shape, not their value.
  const where = `${c.req.method} ${c.req.path.replace(/[A-Za-z0-9_-]{24,}/g, ':token')}`;
  const line = `[error ${errorId}] ${status} on ${where}: ${err.name}: ${err.message}`;
  // Unexpected errors carry their stack, so the request and the code that threw can be found.
  if (expected) logger.error('App', line);
  else logger.error('App', line, err.cause instanceof Error ? err.cause.stack : err.stack);

  c.header('X-Error-Id', errorId);
  return c.json(body, status as ContentfulStatusCode);
};
