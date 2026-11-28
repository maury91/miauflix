import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PreferencesPage from './PreferencesPage';

const mocks = vi.hoisted(() => ({
  updateLanguagePreferences: vi.fn(),
  updateWatchOnce: vi.fn(),
}));

vi.mock('@features/profiles/api/profiles.api', async importOriginal => ({
  ...(await importOriginal<object>()),
  useUpdateLanguagePreferencesMutation: () => [
    mocks.updateLanguagePreferences,
    { isLoading: false, isError: false },
  ],
  useUpdateWatchOnceMutation: () => [mocks.updateWatchOnce, { isLoading: false, isError: false }],
}));

const user = {
  id: 'user-1',
  email: 'alex@example.com',
  displayName: 'Alex',
  role: 'user' as const,
  avatar: null,
  avatarVersion: null,
  languagePreferences: {
    interface: null,
    audio: { default: null, anime: null },
    subtitles: { default: null, anime: null },
    autoSubtitles: false,
  },
  watchOnce: false,
};

const setupTest = (watchOnce = false) => {
  const store = configureStore({
    reducer: { auth: authSlice.reducer },
    preloadedState: {
      auth: {
        currentSessionId: 'session-1',
        currentUser: { ...user, watchOnce },
        availableSessions: [],
      },
    },
  });
  render(
    <Provider store={store}>
      <PreferencesPage onDismiss={vi.fn()} />
    </Provider>
  );
};

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  // jsdom lays nothing out; the navigation layer only sees elements with a box
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PreferencesPage', () => {
  it('turns on watch-once downloads for the current session', () => {
    setupTest();
    const toggle = screen.getByRole('switch', { name: 'Watch-once downloads' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(mocks.updateWatchOnce).toHaveBeenCalledWith({ session: 'session-1', watchOnce: true });
  });
});
