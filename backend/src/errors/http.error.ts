import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { AppError } from './base.error';

const DEFAULT_CODES: Partial<Record<ContentfulStatusCode, string>> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  410: 'gone',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  422: 'unprocessable',
  500: 'internal',
  502: 'bad_gateway',
  503: 'unavailable',
};

/**
 * A failure a route answers with a given status. The message is written for users and is sent
 * as is, whatever the status; the app's error handler adds the rest of the error body.
 */
export class HttpError extends AppError {
  readonly hint?: string;

  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
    { code, hint, cause }: { code?: string; hint?: string; cause?: unknown } = {}
  ) {
    super(message, 'http', code ?? DEFAULT_CODES[status] ?? `http_${status}`);
    // The underlying failure, logged by the error handler; never sent to the client.
    if (cause !== undefined) this.cause = cause;
    this.name = 'HttpError';
    this.hint = hint;
  }
}
