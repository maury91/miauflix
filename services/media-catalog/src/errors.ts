/** Handler-thrown error mapped to `Response.json({error}, {status})` by the router. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = status === 404
      ? 'not_found'
      : status === 503
        ? 'not_configured'
        : 'invalid_request'
  ) {
    super(message);
  }
}
