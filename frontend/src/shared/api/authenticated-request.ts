import type { ApiErrorBody, RefreshResponse } from '@miauflix/backend';
import { isApiErrorBody, reportApiError } from '@shared/lib/api-error';

import { backendClient } from './backend-client';

export interface ApiRequestError {
  status: number;
  /** Human readable message: the server's, or the caller's fallback. */
  data: string;
  /** The server's error body (code, error id, how to fix it), when it sent one. */
  details?: ApiErrorBody;
}

export type ApiRequestResult<T> = { data: T } | { error: ApiRequestError };

const refreshes = new Map<string, Promise<ApiRequestResult<RefreshResponse>>>();

async function parseResponse<T>(
  response: Response,
  errorContext: string
): Promise<ApiRequestResult<T>> {
  if (response.ok) {
    if (response.status === 204) return { data: undefined as T };
    return { data: (await response.json()) as T };
  }

  let message = errorContext;
  let details: ApiErrorBody | undefined;
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };
    if (typeof body.error === 'string') message = body.error;
    else if (typeof body.message === 'string') message = body.message;
    if (isApiErrorBody(body)) details = body;
  } catch {
    // Keep the contextual fallback for empty or non-JSON error responses.
  }
  if (response.status >= 500) reportApiError(errorContext, details ?? message);

  return {
    error: details
      ? { status: response.status, data: message, details }
      : { status: response.status, data: message },
  };
}

function networkError(error: unknown): ApiRequestError {
  return {
    status: (error as { status?: number })?.status ?? 500,
    data: error instanceof Error ? error.message : 'Unknown error',
  };
}

export async function request<T>(
  requestFn: () => Promise<Response>,
  errorContext: string
): Promise<ApiRequestResult<T>> {
  try {
    return await parseResponse<T>(await requestFn(), errorContext);
  } catch (error) {
    return { error: networkError(error) };
  }
}

export function refreshSession(session: string): Promise<ApiRequestResult<RefreshResponse>> {
  const activeRefresh = refreshes.get(session);
  if (activeRefresh) return activeRefresh;

  const refresh = request<RefreshResponse>(
    () => backendClient.api.auth.refresh[':session'].$post({ param: { session } }),
    'Refresh failed'
  ).finally(() => refreshes.delete(session));

  refreshes.set(session, refresh);
  return refresh;
}

interface AuthenticatedRequestOptions {
  requestFn: () => Promise<Response>;
  session: string | null;
  errorContext: string;
  onInvalidSession?: () => void;
}

export async function authenticatedRequest<T>({
  requestFn,
  session,
  errorContext,
  onInvalidSession,
}: AuthenticatedRequestOptions): Promise<ApiRequestResult<T>> {
  const firstResult = await request<T>(requestFn, errorContext);
  if (!session || !('error' in firstResult) || firstResult.error.status !== 401) {
    return firstResult;
  }

  const refreshResult = await refreshSession(session);
  if ('error' in refreshResult) {
    if (refreshResult.error.status === 401) onInvalidSession?.();
    return refreshResult;
  }

  // Retry once only. A second 401 is returned to the caller without another refresh.
  return request<T>(requestFn, errorContext);
}
