import type { ApiErrorBody } from '@miauflix/backend';

/** What to show for a failed request, wherever it is shown. */
export interface ErrorPresentation {
  message: string;
  /** How to fix it, when it can be fixed (e.g. configure TMDB). */
  hint?: string;
  /** Matches the `[error <id>]` line in the server logs. */
  errorId?: string;
  /** The raw server-side message; the server only sends it to admins. */
  detail?: string;
  /** Whether more detail was written to the browser console. */
  inConsole: boolean;
}

export const isApiErrorBody = (value: unknown): value is ApiErrorBody => {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body['code'] === 'string' &&
    typeof body['errorId'] === 'string' &&
    typeof body['message'] === 'string'
  );
};

const reported = new Set<string>();

/**
 * Writes a server failure to the console once per error id, with everything the server sent,
 * so a user can copy it into a bug report or search the server logs for the id.
 */
export function reportApiError(context: string, error: ApiErrorBody | string): void {
  if (typeof error !== 'string') {
    if (reported.has(error.errorId)) return;
    reported.add(error.errorId);
    console.error(
      `[Miauflix] ${context}: ${error.message} (code ${error.code}, error id ${error.errorId}). ` +
        `Search the server logs (docker logs) for "error ${error.errorId}".`,
      error
    );
    return;
  }
  console.error(`[Miauflix] ${context}: ${error}`);
}

/**
 * Turns anything an API call or realtime message failed with (an `ApiRequestError`, a server
 * error body, an Error) into something to display, falling back to `fallback`.
 */
export function presentError(error: unknown, fallback: string): ErrorPresentation {
  const body = isApiErrorBody(error)
    ? error
    : typeof error === 'object' &&
        error !== null &&
        isApiErrorBody((error as { details?: unknown }).details)
      ? (error as { details: ApiErrorBody }).details
      : undefined;
  if (body) {
    return {
      message: body.message,
      hint: body.hint,
      ...(body.detail ? { detail: body.detail } : {}),
      // A fixable problem is explained by its hint; an id only helps for the rest.
      errorId: body.needsConfiguration ? undefined : body.errorId,
      inConsole: true,
    };
  }
  const status = (error as { status?: unknown } | null)?.status;
  return { message: fallback, inConsole: typeof status === 'number' && status >= 500 };
}
