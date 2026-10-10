import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAssociation, beginAuthorization, checkAuthorization, deleteAssociation, refresh } =
  vi.hoisted(() => ({
    getAssociation: vi.fn(),
    beginAuthorization: vi.fn(),
    checkAuthorization: vi.fn(),
    deleteAssociation: vi.fn(),
    refresh: vi.fn(),
  }));

vi.mock('@shared/api/backend-client', () => ({
  backendClient: {
    api: {
      auth: { refresh: { ':session': { $post: refresh } } },
      integrations: {
        trakt: {
          association: { $get: getAssociation, $delete: deleteAssociation },
          authorization: {
            $post: beginAuthorization,
            ':authorizationId': { check: { $post: checkAuthorization } },
          },
        },
      },
    },
  },
}));

import {
  beginTraktAssociation,
  disconnectTrakt,
  getTraktAssociation,
  pollTraktAssociation,
} from './trakt.api';

const session = 'test-session';
const options = { headers: { 'X-Session-Id': session } };

describe('Trakt session authentication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ['association', () => getTraktAssociation(session), getAssociation, {}],
    ['authorization', () => beginTraktAssociation(session), beginAuthorization, {}],
    [
      'poll',
      () => pollTraktAssociation('device-id', session),
      checkAuthorization,
      { param: { authorizationId: 'device-id' } },
    ],
    ['disconnect', () => disconnectTrakt(session), deleteAssociation, {}],
  ] as const)(
    'authenticates the %s request with the selected session',
    async (_name, call, mock, args) => {
      mock.mockResolvedValue(Response.json({ connected: false }));
      expect(await call()).toEqual({ data: { connected: false } });
      expect(mock).toHaveBeenCalledWith(args, options);
    }
  );

  it('refreshes an expired session and retries the association check', async () => {
    getAssociation
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ connected: false }));
    refresh.mockResolvedValue(Response.json({ user: { id: 'user-id' } }));

    expect(await getTraktAssociation(session)).toEqual({ data: { connected: false } });
    expect(refresh).toHaveBeenCalledWith({ param: { session } });
    expect(getAssociation).toHaveBeenCalledTimes(2);
    expect(getAssociation).toHaveBeenLastCalledWith({}, options);
  });
});
