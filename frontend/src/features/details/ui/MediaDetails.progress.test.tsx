import { configureStore } from '@reduxjs/toolkit';
import { detailsNavigationSlice } from '@store/slices/detailsNavigation';
import { realtimeSlice } from '@store/slices/realtime';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { movie, notify, requestAvailability, progress } = vi.hoisted(() => ({
  movie: { sourceAvailability: 'available' as 'available' | 'pending' | 'unavailable' },
  progress: { entry: undefined as unknown },
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
  progressForPlayable: () => progress.entry,
  useGetProgressQuery: () => ({ data: { progress: [] } }),
}));

import type { MediaDto, PreloadPreparationSnapshot } from '@miauwatch/backend';

import { MediaDetails } from './MediaDetails';

const media = { _type: 'movie', mediaId: 77, title: 'Clayface' } as MediaDto;

const entry = (positionSeconds: number, state = 'paused') => ({
  playable: { kind: 'movie', mediaId: 77 },
  positionSeconds,
  durationSeconds: 1000,
  state,
  updatedAt: '2026-11-22T16:00:00.000Z',
});
const warming = (state: 'warming' | 'paused', progress: number) =>
  ({
    playable: { kind: 'movie', mediaId: 77 },
    state: 'source_found',
    source: null,
    warmup: { state, progress },
  }) as PreloadPreparationSnapshot;

const setupTest = (preparation: PreloadPreparationSnapshot | null = null) => {
  const store = configureStore({
    reducer: {
      auth: () => ({ currentUser: { id: 'user-1' } }),
      artwork: () => ({ byMedia: {} }),
      detailsNavigation: detailsNavigationSlice.reducer,
      realtime: realtimeSlice.reducer,
    },
  });
  return render(
    <Provider store={store}>
      <MediaDetails media={media} onWatch={vi.fn()} onBack={vi.fn()} preparation={preparation} />
    </Provider>
  );
};
/** The bar under the watch button: the share watched. */
const watchedBar = (container: HTMLElement) =>
  container.querySelector('[class*="watched"] [aria-hidden="true"], [class*="watched"] > *');

beforeEach(() => {
  progress.entry = undefined;
});

describe('Details watch progress', () => {
  it('shows the share watched under Resume watching', () => {
    progress.entry = entry(400);
    const { container } = setupTest();
    expect(screen.getByRole('button', { name: /Resume watching/ })).toBeInTheDocument();
    expect(watchedBar(container)).not.toBeNull();
  }, 15_000);

  it('offers Watch now, without a bar, for playback that never got past the first seconds', () => {
    progress.entry = entry(1);
    const { container } = setupTest();
    expect(screen.getByRole('button', { name: /Watch now/ })).toBeInTheDocument();
    expect(watchedBar(container)).toBeNull();
  });

  it('says how far torrent preparation got in words, not as a bar under the button', () => {
    const { container, rerender } = setupTest(warming('paused', 65));
    expect(screen.getByText('Torrent preparation paused')).toBeVisible();
    expect(watchedBar(container)).toBeNull();
    rerender(
      <Provider
        store={configureStore({
          reducer: {
            auth: () => ({ currentUser: { id: 'user-1' } }),
            artwork: () => ({ byMedia: {} }),
            detailsNavigation: detailsNavigationSlice.reducer,
            realtime: realtimeSlice.reducer,
          },
        })}
      >
        <MediaDetails
          media={media}
          onWatch={vi.fn()}
          onBack={vi.fn()}
          preparation={warming('warming', 65)}
        />
      </Provider>
    );
    expect(screen.getByText('Preparing torrent (65%)')).toBeVisible();
    expect(screen.getByRole('button', { name: /Watch now/ })).toHaveAccessibleDescription(
      'Preparing torrent (65%)'
    );
  });
});
