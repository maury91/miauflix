import { beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshPost } = vi.hoisted(() => ({ refreshPost: vi.fn() }));

vi.mock('./backend-client', () => ({
  backendClient: {
    api: {
      auth: {
        refresh: {
          ':session': { $post: refreshPost },
        },
      },
    },
  },
}));

import { authenticatedRequest } from './authenticated-request';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('authenticatedRequest', () => {
  beforeEach(() => {
    refreshPost.mockReset();
  });

  it('returns successful requests without refreshing', async () => {
    const requestFn = vi.fn().mockResolvedValue(jsonResponse(200, { value: 'ok' }));

    await expect(
      authenticatedRequest({ requestFn, session: 'one', errorContext: 'Request failed' })
    ).resolves.toEqual({ data: { value: 'ok' } });
    expect(refreshPost).not.toHaveBeenCalled();
  });

  it('refreshes after a 401 and retries the request once', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Authentication required' }))
      .mockResolvedValueOnce(jsonResponse(200, { value: 'restored' }));
    refreshPost.mockResolvedValue(jsonResponse(200, { user: { id: 'user' } }));

    await expect(
      authenticatedRequest({ requestFn, session: 'one', errorContext: 'Request failed' })
    ).resolves.toEqual({ data: { value: 'restored' } });
    expect(refreshPost).toHaveBeenCalledTimes(1);
    expect(requestFn).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent refreshes for the same session', async () => {
    let resolveRefresh!: (response: Response) => void;
    refreshPost.mockReturnValue(
      new Promise<Response>(resolve => {
        resolveRefresh = resolve;
      })
    );
    const firstRequest = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { request: 1 }));
    const secondRequest = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { request: 2 }));

    const results = Promise.all([
      authenticatedRequest({
        requestFn: firstRequest,
        session: 'one',
        errorContext: 'Request failed',
      }),
      authenticatedRequest({
        requestFn: secondRequest,
        session: 'one',
        errorContext: 'Request failed',
      }),
    ]);
    await vi.waitFor(() => expect(refreshPost).toHaveBeenCalledTimes(1));
    resolveRefresh(jsonResponse(200, { user: { id: 'user' } }));

    await expect(results).resolves.toEqual([{ data: { request: 1 } }, { data: { request: 2 } }]);
  });

  it('clears an invalid session without retrying the request', async () => {
    const onInvalidSession = vi.fn();
    const requestFn = vi.fn().mockResolvedValue(jsonResponse(401, {}));
    refreshPost.mockResolvedValue(jsonResponse(401, { error: 'Invalid token' }));

    await expect(
      authenticatedRequest({
        requestFn,
        session: 'one',
        errorContext: 'Request failed',
        onInvalidSession,
      })
    ).resolves.toEqual({ error: { status: 401, data: 'Invalid token' } });
    expect(onInvalidSession).toHaveBeenCalledOnce();
    expect(requestFn).toHaveBeenCalledOnce();
  });

  it('preserves the session on transient refresh failures', async () => {
    const onInvalidSession = vi.fn();
    const requestFn = vi.fn().mockResolvedValue(jsonResponse(401, {}));
    refreshPost.mockResolvedValue(jsonResponse(429, { error: 'Too many requests' }));

    await authenticatedRequest({
      requestFn,
      session: 'one',
      errorContext: 'Request failed',
      onInvalidSession,
    });

    expect(onInvalidSession).not.toHaveBeenCalled();
    expect(requestFn).toHaveBeenCalledOnce();
  });
});
