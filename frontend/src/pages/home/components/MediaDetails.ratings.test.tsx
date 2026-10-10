import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, mutation, save, reset } = vi.hoisted(() => ({
  query: {
    currentData: { rating: 'like' as string | null },
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  mutation: { isLoading: false, isError: false },
  save: vi.fn(),
  reset: vi.fn(),
}));
vi.mock('@features/media/api/ratings.api', () => ({
  useGetMediaRatingQuery: () => query,
  useSetMediaRatingMutation: () => [save, { ...mutation, reset }],
}));
vi.mock('@features/media/api/lists.api', () => ({
  useGetWatchlistMembershipQuery: () => ({ data: { inWatchlist: false } }),
  useAddToWatchlistMutation: () => [vi.fn(), { isLoading: false }],
  useRemoveFromWatchlistMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock('@features/media/api/media.api', () => ({
  useEnsureBackdropFocusMutation: () => [vi.fn()],
  useGetMovieQuery: () => ({
    data: { type: 'movie', title: 'Coyote vs. Acme', genres: [], overview: 'Example' },
  }),
  useGetShowQuery: () => ({}),
  useLazyGetSeasonQuery: () => [vi.fn()],
}));
vi.mock('@features/progress/api/progress.api', () => ({
  progressForPlayable: () => undefined,
  useGetProgressQuery: () => ({ data: { progress: [] } }),
}));

import type { MediaDto } from '@miauflix/backend';

import { MediaDetails } from './MediaDetails';

const setupTest = () => {
  const store = configureStore({
    reducer: () => ({ auth: { currentUser: { id: 'user-1' } }, artwork: { byMedia: {} } }),
  });
  return render(
    <Provider store={store}>
      <MediaDetails
        media={{ _type: 'movie', mediaId: 123, title: 'Coyote vs. Acme' } as MediaDto}
        onWatch={vi.fn()}
        onBack={vi.fn()}
      />
    </Provider>
  );
};

beforeEach(() => {
  query.currentData = { rating: 'like' };
  query.isFetching = false;
  query.isError = false;
  mutation.isLoading = false;
  mutation.isError = false;
  save.mockReset();
});

describe('Details saved ratings', () => {
  it('restores Like on entry and when Details is reopened', () => {
    const first = setupTest();
    expect(screen.getByRole('button', { name: 'Like it' })).toHaveAttribute('aria-pressed', 'true');
    first.unmount();
    setupTest();
    expect(screen.getByRole('button', { name: 'Like it' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Love it' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('sends account-scoped replacements and toggles the saved selection off', () => {
    setupTest();
    fireEvent.click(screen.getByRole('button', { name: 'Love it' }));
    expect(save).toHaveBeenLastCalledWith({
      userId: 'user-1',
      mediaType: 'movie',
      mediaId: 123,
      rating: 'love',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Like it' }));
    expect(save).toHaveBeenLastCalledWith({
      userId: 'user-1',
      mediaType: 'movie',
      mediaId: 123,
      rating: null,
    });
  });

  it('prevents changes while fetching and explains failed saves without changing the saved rating', () => {
    query.isFetching = true;
    const view = setupTest();
    expect(screen.getByRole('button', { name: 'Like it' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Love it' }));
    expect(save).not.toHaveBeenCalled();
    view.unmount();
    query.isFetching = false;
    mutation.isError = true;
    setupTest();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save your rating');
    expect(screen.getByRole('button', { name: 'Like it' })).toHaveAttribute('aria-pressed', 'true');
  });
});
