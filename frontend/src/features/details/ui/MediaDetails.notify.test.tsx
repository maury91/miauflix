import { configureStore } from '@reduxjs/toolkit';
import { detailsNavigationSlice } from '@store/slices/detailsNavigation';
import { realtimeActions, realtimeSlice } from '@store/slices/realtime';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { movie, notify, requestAvailability } = vi.hoisted(() => ({
  movie: { sourceAvailability: 'unavailable' as 'available' | 'pending' | 'unavailable' },
  notify: {} as {
    isLoading?: boolean;
    isSuccess?: boolean;
    isError?: boolean;
    originalArgs?: unknown;
  },
  requestAvailability: vi.fn(),
}));
vi.mock('@features/media/api/ratings.api', () => ({
  useGetMediaRatingQuery: () => ({ currentData: { rating: null }, isFetching: false }),
  useSetMediaRatingMutation: () => [vi.fn(), { isLoading: false, reset: vi.fn() }],
}));
vi.mock('@features/media/api/lists.api', () => ({
  useGetWatchlistMembershipQuery: () => ({ data: { inWatchlist: false } }),
  useAddToWatchlistMutation: () => [vi.fn(), { isLoading: false }],
  useRemoveFromWatchlistMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock('@features/media/api/media.api', () => ({
  useEnsureBackdropFocusMutation: () => [
    () => ({ unwrap: () => Promise.resolve({ backdropFocus: null }) }),
  ],
  useGetMovieQuery: () => ({
    data: { type: 'movie', title: 'Clayface', genres: [], overview: 'Example', ...movie },
  }),
  useGetShowQuery: () => ({}),
  useGetSeasonQuery: () => ({}),
  useLazyGetSeasonQuery: () => [vi.fn()],
}));
vi.mock('@features/notifications/api/notifications.api', () => ({
  useRequestAvailabilityMutation: () => [requestAvailability, notify],
}));
vi.mock('@features/progress/api/progress.api', () => ({
  progressForPlayable: () => undefined,
  useGetProgressQuery: () => ({ data: { progress: [] } }),
}));

import type { MediaDto } from '@miauflix/backend';

import { MediaDetails } from './MediaDetails';

const media = { _type: 'movie', mediaId: 77, title: 'Clayface' } as MediaDto;
const playable = { kind: 'movie', mediaId: 77 } as const;

const setupTest = () => {
  const store = configureStore({
    reducer: {
      auth: () => ({ currentUser: { id: 'user-1' } }),
      artwork: () => ({ byMedia: {} }),
      detailsNavigation: detailsNavigationSlice.reducer,
      realtime: realtimeSlice.reducer,
    },
  });
  const onWatch = vi.fn();
  const tree = () => (
    <Provider store={store}>
      <MediaDetails media={media} onWatch={onWatch} onBack={vi.fn()} />
    </Provider>
  );
  const view = render(tree());
  return { store, onWatch, rerender: () => view.rerender(tree()) };
};

beforeEach(() => {
  movie.sourceAvailability = 'unavailable';
  for (const key of Object.keys(notify)) delete notify[key as keyof typeof notify];
  requestAvailability.mockReset();
});

describe('Details Watch action without a source', () => {
  it('offers Notify Me instead of Watch Now and requests a notification', () => {
    const { onWatch } = setupTest();
    expect(screen.queryByRole('button', { name: /Watch Now/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Notify Me/ }));
    expect(requestAvailability).toHaveBeenCalledWith(playable);
    expect(onWatch).not.toHaveBeenCalled();
  }, 15_000);

  it('confirms a saved request and does not send it again', () => {
    Object.assign(notify, { isSuccess: true, originalArgs: playable });
    setupTest();
    const button = screen.getByRole('button', { name: /Notification Set/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(requestAvailability).not.toHaveBeenCalled();
  });

  it('reports a request that could not be saved', () => {
    Object.assign(notify, { isError: true, originalArgs: playable });
    setupTest();
    expect(screen.getByRole('alert')).toHaveTextContent('The notification could not be saved');
    expect(screen.getByRole('button', { name: /Notify Me/ })).toBeInTheDocument();
  });

  it('keeps Watch Now while sources are still being checked', () => {
    movie.sourceAvailability = 'pending';
    const { onWatch } = setupTest();
    fireEvent.click(screen.getByRole('button', { name: /Watch Now/ }));
    expect(onWatch).toHaveBeenCalledWith(playable);
  });

  it('switches back to Watch Now once a real source is pushed', () => {
    const { store } = setupTest();
    expect(screen.getByRole('button', { name: /Notify Me/ })).toBeInTheDocument();
    act(() => {
      store.dispatch(
        realtimeActions.sourceReceived({
          type: 'source-availability',
          playable,
          availability: 'available',
        } as never)
      );
    });
    expect(screen.getByRole('button', { name: /Watch Now/ })).toBeInTheDocument();
  });
});
