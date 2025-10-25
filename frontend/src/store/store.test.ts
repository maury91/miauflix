import { describe, expect, it } from 'vitest';

import { store } from './store';

describe('Store', () => {
  it('should create store with correct initial state', () => {
    const state = store.getState();

    // Check that authApi reducer is present
    expect(state).toHaveProperty('authApi');
    expect(state.authApi).toBeDefined();
  });

  it('should have authApi middleware configured', () => {
    // This is a basic test to ensure the store is properly configured
    // The actual middleware testing would require more complex setup
    expect(store.getState().authApi).toBeDefined();
  });

  it('should dispatch actions without errors', () => {
    // Test that the store can handle basic operations
    const initialState = store.getState();
    expect(initialState).toBeDefined();

    // Store should be able to dispatch actions (even if they don't exist)
    expect(() => {
      store.dispatch({ type: 'test/action' });
    }).not.toThrow();
  });
});
