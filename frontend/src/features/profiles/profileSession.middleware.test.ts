import { progressApi } from '@features/progress/api/progress.api';
import { configureStore } from '@reduxjs/toolkit';
import { authSlice, CURRENT_SESSION_STORAGE_KEY, setSession } from '@store/slices/auth';
import { afterEach, describe, expect, it } from 'vitest';

import { profileSessionMiddleware } from './profileSession.middleware';

const setupTest = () => {
  const actions: string[] = [];
  const store = configureStore({
    reducer: { auth: authSlice.reducer },
    middleware: getDefault =>
      getDefault().concat(
        () => next => action => {
          actions.push((action as { type: string }).type);
          return next(action);
        },
        profileSessionMiddleware
      ),
  });
  return { store, actions };
};

afterEach(() => window.sessionStorage.clear());

describe('profileSessionMiddleware', () => {
  it('remembers the chosen profile for this app run', () => {
    const { store } = setupTest();
    store.dispatch(setSession('one'));
    expect(window.sessionStorage.getItem(CURRENT_SESSION_STORAGE_KEY)).toBe('one');
  });

  it('drops the previous profile’s cached data when another starts watching', () => {
    const { store, actions } = setupTest();
    store.dispatch(setSession('one'));
    expect(actions).not.toContain(progressApi.util.resetApiState().type);

    store.dispatch(setSession('two'));
    expect(actions).toContain(progressApi.util.resetApiState().type);
    expect(window.sessionStorage.getItem(CURRENT_SESSION_STORAGE_KEY)).toBe('two');
  });
});
