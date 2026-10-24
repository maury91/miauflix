import { configureStore } from '@reduxjs/toolkit';
import { detailsNavigationSlice } from '@store/slices/detailsNavigation';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, mutation, save, reset, ensureBackdropFocus } = vi.hoisted(() => ({
  query: {
    currentData: { rating: 'like' as string | null },
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  mutation: { isLoading: false, isError: false },
  save: vi.fn(),
  reset: vi.fn(),
  ensureBackdropFocus: vi.fn(function ensureBackdropFocus() {
    return { unwrap: () => Promise.resolve({ backdropFocus: null }) };
  }),
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
  useEnsureBackdropFocusMutation: () => [ensureBackdropFocus],
  useGetMovieQuery: () => ({
    data: { type: 'movie', title: 'Coyote vs. Acme', genres: [], overview: 'Example' },
  }),
  useGetShowQuery: () => ({}),
  useGetSeasonQuery: () => ({}),
  useLazyGetSeasonQuery: () => [vi.fn()],
}));
vi.mock('@features/progress/api/progress.api', () => ({
  progressForPlayable: () => undefined,
  useGetProgressQuery: () => ({ data: { progress: [] } }),
}));

import type { MediaDto } from '@miauflix/backend';

import { MediaDetails } from './MediaDetails';

const makeMedia = (overrides: Partial<MediaDto> = {}): MediaDto =>
  ({ _type: 'movie', mediaId: 123, title: 'Coyote vs. Acme', ...overrides }) as MediaDto;

const setupTest = (media = makeMedia()) => {
  const store = configureStore({
    reducer: {
      auth: () => ({ currentUser: { id: 'user-1' } }),
      artwork: () => ({ byMedia: {} }),
      detailsNavigation: detailsNavigationSlice.reducer,
    },
  });
  const createTree = (currentMedia: MediaDto) => (
    <Provider store={store}>
      <MediaDetails media={currentMedia} onWatch={vi.fn()} onBack={vi.fn()} />
    </Provider>
  );
  const view = render(createTree(media));
  return {
    ...view,
    rerender: (currentMedia = media) => view.rerender(createTree(currentMedia)),
  };
};

beforeEach(() => {
  query.currentData = { rating: 'like' };
  query.isFetching = false;
  query.isError = false;
  mutation.isLoading = false;
  mutation.isError = false;
  save.mockReset();
  ensureBackdropFocus.mockClear();
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

  it('does not repeat backdrop work when refreshed media keeps the same identity and artwork', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    const media = makeMedia({ backdrop: '/backdrop.jpg' });
    const view = setupTest(media);
    await act(async () => Promise.resolve());
    expect(ensureBackdropFocus).toHaveBeenCalledOnce();

    await act(async () => {
      view.rerender({ ...media, title: 'Coyote vs. Acme (refreshed)' });
      await Promise.resolve();
    });

    expect(ensureBackdropFocus).toHaveBeenCalledOnce();
    expect(screen.getByRole('main')).toBeInTheDocument();
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
