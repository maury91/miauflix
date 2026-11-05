import { authApi } from '@features/auth/api/auth.api';
import { afterEach, describe, expect, it } from 'vitest';

import {
  addSession,
  authSlice,
  CURRENT_SESSION_STORAGE_KEY,
  profileUpdated,
  selectAdminSession,
  selectProfiles,
  sessionRemoved,
  setSession,
} from './auth';

const session = (id: string, userId: string, role: 'admin' | 'user' = 'admin') => ({
  session: id,
  user: {
    id: userId,
    email: `${userId}@example.com`,
    displayName: userId,
    role,
    avatar: null,
    avatarVersion: null,
  },
});

function fulfilled(endpointName: string, payload: unknown, originalArgs?: unknown) {
  return {
    type: `${authApi.reducerPath}/executeQuery/fulfilled`,
    payload,
    meta: { arg: { endpointName, originalArgs }, requestStatus: 'fulfilled' },
  };
}

function mutationFulfilled(endpointName: string, payload: unknown, originalArgs: unknown) {
  return {
    type: `${authApi.reducerPath}/executeMutation/fulfilled`,
    payload,
    meta: { arg: { endpointName, originalArgs }, requestStatus: 'fulfilled' },
  };
}

function mutationRejected(endpointName: string, payload: unknown, originalArgs: unknown) {
  return {
    type: `${authApi.reducerPath}/executeMutation/rejected`,
    payload,
    error: { message: 'Rejected' },
    meta: {
      arg: { endpointName, originalArgs },
      requestStatus: 'rejected',
      rejectedWithValue: true,
    },
  };
}

const listed = (sessions: ReturnType<typeof session>[]) => fulfilled('listSessions', sessions);

afterEach(() => window.sessionStorage.clear());

describe('auth session bootstrap', () => {
  it('asks who is watching on a fresh start, even with a single profile', () => {
    const state = authSlice.reducer(
      undefined,
      listed([session('one', 'user-1'), session('two', 'user-1')])
    );

    expect(state.currentSessionId).toBeNull();
    expect(state.availableSessions).toHaveLength(2);
  });

  it('restores the profile chosen earlier in this app run while it is still listed', () => {
    window.sessionStorage.setItem(CURRENT_SESSION_STORAGE_KEY, 'two');
    const state = authSlice.reducer(
      undefined,
      listed([session('one', 'user-1'), session('two', 'user-2')])
    );

    expect(state.currentSessionId).toBe('two');
    expect(state.currentUser?.id).toBe('user-2');
  });

  it('forgets a chosen profile the server no longer lists', () => {
    window.sessionStorage.setItem(CURRENT_SESSION_STORAGE_KEY, 'gone');
    const state = authSlice.reducer(undefined, listed([session('one', 'user-1')]));

    expect(state.currentSessionId).toBeNull();
  });
});

describe('auth profiles', () => {
  it('adds a signed-in profile without switching to it', () => {
    let state = authSlice.reducer(undefined, listed([session('one', 'user-1')]));
    state = authSlice.reducer(state, setSession('one'));
    state = authSlice.reducer(
      state,
      mutationFulfilled('login', session('two', 'user-2'), { email: 'x', password: 'y' })
    );

    expect(state.currentSessionId).toBe('one');
    expect(state.availableSessions.map(({ session }) => session)).toEqual(['one', 'two']);
  });

  it('removes only the logged-out profile', () => {
    let state = authSlice.reducer(
      undefined,
      listed([session('one', 'user-1'), session('two', 'user-2')])
    );
    state = authSlice.reducer(state, setSession('two'));
    state = authSlice.reducer(
      state,
      mutationFulfilled('logout', { message: 'ok' }, { session: 'one' })
    );
    expect(state.availableSessions.map(({ session }) => session)).toEqual(['two']);
    expect(state.currentSessionId).toBe('two');

    state = authSlice.reducer(
      state,
      mutationFulfilled('logout', { message: 'ok' }, { session: 'two' })
    );
    expect(state.availableSessions).toEqual([]);
    expect(state.currentSessionId).toBeNull();
    expect(state.currentUser).toBeNull();
  });

  it('keeps a profile whose logout may not have ended its session, and drops an invalid one', () => {
    let state = authSlice.reducer(
      undefined,
      listed([session('one', 'user-1'), session('two', 'user-2')])
    );
    for (const status of [429, 500])
      state = authSlice.reducer(
        state,
        mutationRejected('logout', { status, data: 'Failed' }, { session: 'one' })
      );
    expect(state.availableSessions.map(({ session }) => session)).toEqual(['one', 'two']);

    state = authSlice.reducer(
      state,
      mutationRejected('logout', { status: 401, data: 'Invalid session' }, { session: 'one' })
    );
    expect(state.availableSessions.map(({ session }) => session)).toEqual(['two']);
  });

  it('drops only a refused session, keeping who is watching', () => {
    let state = authSlice.reducer(
      undefined,
      listed([session('one', 'user-1'), session('two', 'user-2')])
    );
    state = authSlice.reducer(state, setSession('two'));
    state = authSlice.reducer(state, sessionRemoved('one'));
    expect(state.availableSessions.map(({ session }) => session)).toEqual(['two']);
    expect(state.currentSessionId).toBe('two');
  });

  it('updates a profile in every session it holds', () => {
    let state = authSlice.reducer(
      undefined,
      listed([session('one', 'user-1'), session('two', 'user-1')])
    );
    state = authSlice.reducer(state, setSession('two'));
    const renamed = { ...session('x', 'user-1').user, displayName: 'Maurizio' };
    state = authSlice.reducer(state, profileUpdated(renamed));

    expect(state.availableSessions.every(({ user }) => user.displayName === 'Maurizio')).toBe(true);
    expect(state.currentUser?.displayName).toBe('Maurizio');
  });

  it('lists one profile per account, through the session in use', () => {
    let state = authSlice.reducer(
      undefined,
      listed([session('one', 'user-1'), session('two', 'user-2'), session('three', 'user-1')])
    );
    state = authSlice.reducer(state, setSession('three'));

    expect(selectProfiles({ auth: state }).map(({ session }) => session)).toEqual(['three', 'two']);
  });

  it('finds an admin profile on the device to add profiles with', () => {
    let state = authSlice.reducer(
      undefined,
      listed([session('one', 'user-1', 'user'), session('two', 'user-2', 'admin')])
    );
    state = authSlice.reducer(state, setSession('one'));
    expect(selectAdminSession({ auth: state })?.session).toBe('two');

    state = authSlice.reducer(state, addSession(session('three', 'user-3', 'user')));
    state = authSlice.reducer(
      state,
      mutationFulfilled('logout', { message: 'ok' }, { session: 'two' })
    );
    expect(selectAdminSession({ auth: state })).toBeNull();
  });
});
