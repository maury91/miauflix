import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({
  createUser: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@shared/api/backend-client', () => ({
  backendClient: {
    api: {
      auth: {
        users: { $post: backend.createUser },
        login: { $post: backend.login },
        refresh: { ':session': { $post: backend.refresh } },
      },
    },
  },
}));

import { profilesApi } from './profiles.api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = {
  id: 'user-2',
  email: 'alex@example.com',
  displayName: 'Alex',
  role: 'user' as const,
  avatar: { kind: 'pill' },
  avatarVersion: null,
};

const setupTest = () => {
  const store = configureStore({
    reducer: { auth: authSlice.reducer, [profilesApi.reducerPath]: profilesApi.reducer },
    middleware: getDefault => getDefault().concat(profilesApi.middleware),
  });
  const create = () =>
    store.dispatch(
      profilesApi.endpoints.createProfile.initiate({
        adminSession: 'admin-session',
        email: user.email,
        password: 'a-password',
        displayName: user.displayName,
        avatar: user.avatar,
      })
    );
  return { store, create };
};

describe('createProfile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('signs in an account an earlier try created, instead of reporting it taken', async () => {
    const { store, create } = setupTest();
    backend.createUser.mockResolvedValue(
      json(409, { error: 'An account with this email already exists' })
    );
    backend.login.mockResolvedValue(json(200, { session: 'new-session', user }));

    const result = await create();

    expect(result).toEqual({ data: { session: 'new-session', user } });
    expect(store.getState().auth.availableSessions).toEqual([{ session: 'new-session', user }]);
  });

  it('reports a taken email when its password does not sign it in', async () => {
    const { store, create } = setupTest();
    backend.createUser.mockResolvedValue(
      json(409, { error: 'An account with this email already exists' })
    );
    backend.login.mockResolvedValue(json(401, { error: 'Invalid credentials' }));

    const result = await create();

    expect(result).toEqual({
      error: { status: 409, data: 'An account with this email already exists' },
    });
    expect(store.getState().auth.availableSessions).toEqual([]);
  });
});
