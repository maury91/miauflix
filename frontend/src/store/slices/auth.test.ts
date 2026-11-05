import { authApi } from '@features/auth/api/auth.api';
import { describe, expect, it } from 'vitest';

import { authSlice } from './auth';

const session = (id: string, userId: string) => ({
  session: id,
  user: { id: userId, email: `${userId}@example.com`, displayName: userId, role: 'admin' as const },
});

function listedSessionsAction(sessions: ReturnType<typeof session>[]) {
  return {
    type: `${authApi.reducerPath}/executeQuery/fulfilled`,
    payload: sessions,
    meta: { arg: { endpointName: 'listSessions' } },
  };
}

describe('auth session bootstrap', () => {
  it('selects a session when multiple cookies belong to the same user', () => {
    const state = authSlice.reducer(
      undefined,
      listedSessionsAction([session('one', 'user-1'), session('two', 'user-1')])
    );

    expect(state.currentSessionId).toBe('one');
    expect(state.currentUser?.id).toBe('user-1');
  });

  it('does not select a session when cookies belong to different users', () => {
    const state = authSlice.reducer(
      undefined,
      listedSessionsAction([session('one', 'user-1'), session('two', 'user-2')])
    );

    expect(state.currentSessionId).toBeNull();
  });
});
