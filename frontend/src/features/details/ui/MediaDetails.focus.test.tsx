import type { MediaDto, SeasonResponse, ShowResponse } from '@miauflix/backend';
import { configureStore } from '@reduxjs/toolkit';
import { detailsNavigationActions, detailsNavigationSlice } from '@store/slices/detailsNavigation';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { show, seasons, ensureBackdropFocus, sectionsOf } = vi.hoisted(() => {
  const sections = new WeakMap<object, unknown[]>();
  return {
    ensureBackdropFocus: () => ({ unwrap: () => Promise.resolve({ backdropFocus: null }) }),
    /** Stable per `loaded` object, as the real hook's memo is. */
    sectionsOf: (loaded: Record<number, unknown>) => {
      if (!sections.has(loaded)) sections.set(loaded, Object.values(loaded));
      return sections.get(loaded)!;
    },
    show: { data: undefined as unknown },
    seasons: {
      loaded: {} as Record<number, unknown>,
      request: vi.fn(),
      retry: vi.fn(),
    },
  };
});
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
  useEnsureBackdropFocusMutation: () => [ensureBackdropFocus],
  useGetMovieQuery: () => ({}),
  useGetShowQuery: () => show,
}));
vi.mock('@features/details/hooks/useShowSeasons', () => ({
  useShowSeasons: () => {
    return {
      loaded: seasons.loaded,
      loadedSections: sectionsOf(seasons.loaded) as SeasonResponse[],
      loading: false,
      failedSeasons: [],
      request: seasons.request,
      retry: seasons.retry,
    };
  },
}));
vi.mock('@features/notifications/api/notifications.api', () => ({
  useRequestAvailabilityMutation: () => [vi.fn(), {}],
}));
vi.mock('@features/progress/api/progress.api', () => ({
  progressForPlayable: () => undefined,
  useGetProgressQuery: () => ({ data: { progress: [] } }),
}));

import { MediaDetails } from './MediaDetails';

const season = (seasonNumber: number) =>
  ({
    id: seasonNumber,
    seasonNumber,
    name: `Season ${seasonNumber}`,
    episodes: [1, 2].map(episodeNumber => ({
      id: seasonNumber * 100 + episodeNumber,
      episodeNumber,
      title: `S${seasonNumber} episode ${episodeNumber}`,
      overview: null,
      still: null,
    })),
  }) as unknown as SeasonResponse;

const showData = {
  type: 'tv',
  mediaId: 7,
  title: 'Fixture show',
  genres: [],
  seasons: [season(1), season(2)].map(({ id, seasonNumber, name }) => ({
    id,
    seasonNumber,
    name,
  })),
} as unknown as ShowResponse;

const media = { _type: 'tvshow', mediaId: 7, title: 'Fixture show' } as MediaDto;

const setup = () => {
  const store = configureStore({
    reducer: {
      auth: () => ({ currentUser: { id: 'user-1' } }),
      artwork: () => ({ byMedia: {} }),
      detailsNavigation: detailsNavigationSlice.reducer,
    },
  });
  const tree = () => (
    <Provider store={store}>
      <MediaDetails media={media} onWatch={vi.fn()} onBack={vi.fn()} />
    </Provider>
  );
  const view = render(tree());
  return { store, rerender: () => view.rerender(tree()) };
};

/** The element holding DOM focus: its accessible label, or its text. */
const focusedLabel = () => {
  const active = document.activeElement;
  if (!active || active === document.body) return null;
  return active.getAttribute('aria-label') ?? active.textContent;
};

beforeEach(() => {
  // jsdom lays nothing out: every element counts as shown, so navigation can focus it
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList
  );
  show.data = undefined;
  seasons.loaded = {};
  seasons.request.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Details initial focus for a show', () => {
  it('loads the remembered episode’s season and focuses that episode', () => {
    show.data = showData;
    seasons.loaded = { 1: season(1) };
    const store = configureStore({
      reducer: {
        auth: () => ({ currentUser: { id: 'user-1' } }),
        artwork: () => ({ byMedia: {} }),
        detailsNavigation: detailsNavigationSlice.reducer,
      },
    });
    // Coming back from the player, on an episode of the second season
    store.dispatch(detailsNavigationActions.activateDetails({ mediaId: 7, mediaType: 'tvshow' }));
    store.dispatch(detailsNavigationActions.selectEpisode({ seasonNumber: 2, episodeNumber: 2 }));
    const tree = () => (
      <Provider store={store}>
        <MediaDetails media={media} onWatch={vi.fn()} onBack={vi.fn()} />
      </Provider>
    );
    const view = render(tree());

    expect(seasons.request).toHaveBeenCalledWith(2);
    act(() => {
      seasons.loaded = { 1: season(1), 2: season(2) };
      view.rerender(tree());
    });
    expect(focusedLabel()).toContain('S2 episode 2');
  });

  it('keeps focus where the user moved it while the show loads', () => {
    const view = setup();
    const back = screen.getByRole('button', { name: /Back to browse/ });
    fireEvent.mouseMove(back, { clientX: 1, clientY: 1 });
    fireEvent.mouseMove(back, { clientX: 2, clientY: 2 });
    expect(focusedLabel()).toContain('Back to browse');

    act(() => {
      show.data = showData;
      seasons.loaded = { 1: season(1) };
      view.rerender();
    });

    expect(focusedLabel()).toContain('Back to browse');
  });

  it('focuses the opening season of a show already loaded', () => {
    show.data = showData;
    seasons.loaded = { 1: season(1) };
    setup();
    expect(focusedLabel()).toBe('Season 1');
  });

  it('focuses the opening season when the user did not move', () => {
    const view = setup();
    act(() => {
      show.data = showData;
      seasons.loaded = { 1: season(1) };
      view.rerender();
    });

    expect(focusedLabel()).toBe('Season 1');
  });
});
