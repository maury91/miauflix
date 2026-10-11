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
  const createTree = () => (
    <Provider store={store}>
      <MediaDetails
        media={{ _type: 'movie', mediaId: 123, title: 'Coyote vs. Acme' } as MediaDto}
        onWatch={vi.fn()}
        onBack={vi.fn()}
      />
    </Provider>
  );
  const view = render(createTree());
  return { ...view, rerender: () => view.rerender(createTree()) };
};

beforeEach(() => {
  query.currentData = { rating: 'like' };
  query.isFetching = false;
  query.isError = false;
  mutation.isLoading = false;
  mutation.isError = false;
  save.mockReset();
});

// These tests check rating state; browser E2E tests cover visibility and layout.
// Label queries avoid repeated styled-DOM visibility calculations in jsdom.
describe('Details saved ratings', () => {
  // The first styled Details mount and reopen are CPU-heavy on shared CI runners.
  it('restores Like on entry and when Details is reopened', () => {
    const first = setupTest();
    expect(screen.getByLabelText('Like it', { selector: 'button' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    first.unmount();
    setupTest();
    expect(screen.getByLabelText('Like it', { selector: 'button' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByLabelText('Love it', { selector: 'button' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  }, 15_000);

  it('sends account-scoped replacements using the latest saved rating', () => {
    const view = setupTest();
    fireEvent.click(screen.getByLabelText('Love it', { selector: 'button' }));
    expect(save).toHaveBeenLastCalledWith({
      userId: 'user-1',
      mediaType: 'movie',
      mediaId: 123,
      rating: 'love',
    });
    query.currentData = { rating: 'love' };
    view.rerender();
    fireEvent.click(screen.getByLabelText('Like it', { selector: 'button' }));
    expect(save).toHaveBeenLastCalledWith({
      userId: 'user-1',
      mediaType: 'movie',
      mediaId: 123,
      rating: 'like',
    });
  });

  it('clears the currently saved rating when selected again', () => {
    setupTest();
    fireEvent.click(screen.getByLabelText('Like it', { selector: 'button' }));
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
    expect(screen.getByLabelText('Like it', { selector: 'button' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    fireEvent.click(screen.getByLabelText('Love it', { selector: 'button' }));
    expect(save).not.toHaveBeenCalled();
    view.unmount();
    query.isFetching = false;
    mutation.isError = true;
    setupTest();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save your rating');
    expect(screen.getByLabelText('Like it', { selector: 'button' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
