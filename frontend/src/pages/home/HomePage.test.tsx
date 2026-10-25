import { navigate } from '@app/router';
import type { RootState } from '@store/store';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useGetListsInfiniteQuery,
  useGetMovieQuery,
  useGetShowQuery,
  useGetSeasonQuery,
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  markNotificationRead,
  resetNotificationsApi,
  rowHandles,
  rowProps,
  mediaIndexes,
  detailsHandleAction,
  useUpdateIntentMutation,
  removeIntent,
  selectSession,
  selectMovie,
  initiateMovie,
  initiateShow,
  dispatch,
  getAssociation,
  currentSession,
  currentUser,
  mockedClearAuth,
  mockedSetSession,
  homeNavigationState,
  realtimeState,
  heroControls,
} = vi.hoisted(() => ({
  useGetListsInfiniteQuery: vi.fn(),
  useGetMovieQuery: vi.fn(),
  useGetShowQuery: vi.fn(),
  useGetSeasonQuery: vi.fn(),
  useGetNotificationsQuery: vi.fn(),
  useMarkNotificationReadMutation: vi.fn(),
  markNotificationRead: vi.fn(),
  resetNotificationsApi: vi.fn(() => ({ type: 'notificationsApi/resetApiState' })),
  rowHandles: new Map<number, Record<string, unknown>>(),
  rowProps: new Map<number, { loadIntent?: string; visible?: boolean }>(),
  mediaIndexes: new Map<number, number>(),
  detailsHandleAction: vi.fn(),
  useUpdateIntentMutation: vi.fn(),
  removeIntent: vi.fn(),
  selectSession: vi.fn(),
  selectMovie: vi.fn(),
  initiateMovie: vi.fn(),
  initiateShow: vi.fn(),
  dispatch: vi.fn(),
  getAssociation: vi.fn(),
  currentSession: vi.fn(),
  currentUser: vi.fn(),
  mockedClearAuth: Object.assign(() => ({ type: 'auth/clearAuth' }), {
    type: 'auth/clearAuth',
  }),
  mockedSetSession: Object.assign(
    (session: string) => ({ type: 'auth/setSession', payload: session }),
    {
      type: 'auth/setSession',
    }
  ),
  homeNavigationState: {
    value: {
      activeRegion: 'carousel',
      activeCategory: 0,
      selectedByCategory: {} as Record<string, number>,
      pendingCategoryAdvance: false,
    } as RootState['homeNavigation'],
    revision: 0,
    listeners: new Set<() => void>(),
  },
  realtimeState: { ready: false, preparationByMediaId: {} as Record<number, unknown> },
  heroControls: { ready: null as null | ((mediaId: number | null) => void) },
}));

vi.mock('@features/integrations/api/trakt.api', () => ({
  getTraktAssociation: getAssociation,
  beginTraktAssociation: vi.fn(),
  pollTraktAssociation: vi.fn(),
}));

vi.mock('@features/media/api/lists.api', () => ({
  useGetListsInfiniteQuery,
}));
vi.mock('@features/media/api/media.api', () => ({
  useGetMovieQuery,
  useGetShowQuery,
  useGetSeasonQuery,
  mediaApi: {
    util: { prefetch: vi.fn() },
    endpoints: {
      getMovie: { select: selectMovie, initiate: initiateMovie },
      getShow: { select: vi.fn(() => () => ({})), initiate: initiateShow },
    },
  },
}));
vi.mock('@features/preload/api/preload.api', () => ({
  useUpdateIntentMutation,
  useRemoveIntentMutation: () => [removeIntent],
}));
vi.mock('@features/notifications/api/notifications.api', () => ({
  notificationsApi: { util: { resetApiState: resetNotificationsApi } },
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
}));
vi.mock('@shared/components', () => ({ Spinner: () => null }));
vi.mock('@store/slices/auth', () => ({
  selectCurrentSessionId: currentSession,
  selectCurrentUser: currentUser,
  clearAuth: mockedClearAuth,
  setSession: mockedSetSession,
}));
vi.mock('@store/store', () => ({}));
vi.mock('react-redux', async () => {
  const React = await import('react');
  return {
    useDispatch: () => dispatch,
    useSelector: (selector: (state: unknown) => unknown) => {
      const selectorRef = React.useRef(selector);
      const snapshot = React.useRef({ initialized: false, value: undefined as unknown });
      selectorRef.current = selector;
      const getSnapshot = () => {
        const nextValue = selectSession(state =>
          selectorRef.current({
            ...(state && typeof state === 'object' ? state : {}),
            homeNavigation: homeNavigationState.value,
            realtime: realtimeState,
          })
        );
        if (!snapshot.current.initialized || !Object.is(snapshot.current.value, nextValue)) {
          snapshot.current = {
            initialized: true,
            value: nextValue,
          };
        }
        return snapshot.current.value;
      };
      return React.useSyncExternalStore(listener => {
        homeNavigationState.listeners.add(listener);
        return () => homeNavigationState.listeners.delete(listener);
      }, getSnapshot);
    },
  };
});
vi.mock('./hooks/useMediaBoxSizes', () => ({
  useMediaBoxSizes: () => ({
    mediaWidth: 180,
    mediaPerPage: 1,
    gap: 12,
    margin: 24,
    rowHeight: 300,
  }),
}));
vi.mock('./components/CategoryRow', async () => {
  const React = await import('react');
  return {
    CategoryRow: React.forwardRef(
      (
        props: {
          category: { slug: string };
          categoryIndex: number;
          isCurrentRow: boolean;
          active: boolean;
          mediaOverride?: unknown[];
          loadIntent?: string;
          visible?: boolean;
          onActive: (categoryIndex: number, mediaIndex: number, media: unknown) => void;
          onDataReady: (slug: string) => void;
          onSelectionChange: (mediaIndex: number) => void;
          onSelect: (media: unknown) => void;
        },
        ref
      ) => {
        rowProps.set(props.categoryIndex, {
          loadIntent: props.loadIntent,
          visible: props.visible,
        });
        const {
          mediaOverride,
          onActive,
          categoryIndex,
          isCurrentRow,
          loadIntent,
          onDataReady,
          category,
        } = props;
        const mediaIndex = mediaIndexes.get(categoryIndex) ?? 0;
        const media = React.useMemo(
          () =>
            mediaOverride?.[mediaIndex] ?? {
              _type: 'movie',
              id: categoryIndex + 1,
              mediaId: 100 + categoryIndex,
            },
          [categoryIndex, mediaIndex, mediaOverride]
        );
        React.useEffect(() => {
          if (loadIntent !== 'dormant') onDataReady(category.slug);
          if (isCurrentRow) onActive(categoryIndex, mediaIndex, media);
        }, [
          categoryIndex,
          isCurrentRow,
          media,
          mediaIndex,
          onActive,
          category.slug,
          loadIntent,
          onDataReady,
        ]);
        const handle = rowHandles.get(props.categoryIndex);
        React.useImperativeHandle(ref, () => handle, [handle]);
        return React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': `card-${props.categoryIndex}`,
            'data-active': props.active,
            onMouseEnter: () => {
              props.onSelectionChange(mediaIndex);
              props.onActive(props.categoryIndex, mediaIndex, media);
            },
            onClick: () => {
              props.onSelectionChange(mediaIndex);
              props.onActive(props.categoryIndex, mediaIndex, media);
              props.onSelect(media);
            },
          },
          `Category ${props.categoryIndex}`
        );
      }
    ),
  };
});
vi.mock('./components/PlayerView', () => ({
  PlayerView: (props: {
    playable: { kind: string; mediaId?: number; showMediaId?: number };
    nextEpisode?: { playable: unknown } | null;
  }) => (
    <div
      data-testid="player"
      data-playable-kind={props.playable.kind}
      data-next-episode={props.nextEpisode ? JSON.stringify(props.nextEpisode.playable) : ''}
    />
  ),
}));
vi.mock('./components/MediaHero', async () => {
  const React = await import('react');
  return {
    MediaHero: (props: {
      media?: { mediaId?: number } | null;
      onReady?: (mediaId: number | null) => void;
      preparation?: {
        state: string;
        source?: { quality: string };
        warmup?: { state: string };
      } | null;
    }) => {
      heroControls.ready = props.onReady ?? null;
      return React.createElement('div', {
        'data-testid': 'hero',
        'data-media-id': props.media?.mediaId,
        'data-source-status': props.preparation?.state ?? 'checking',
        'data-quality': props.preparation?.source?.quality,
        'data-warmup': props.preparation?.warmup?.state,
      });
    },
  };
});
vi.mock('./components/MediaDetails', async () => {
  const React = await import('react');
  return {
    MediaDetails: React.forwardRef(
      (
        props: {
          media: { mediaId: number };
          preparation?: {
            state: string;
            source?: { quality: string };
            warmup?: { state: string };
          } | null;
        },
        ref
      ) => {
        React.useImperativeHandle(ref, () => ({ handleAction: detailsHandleAction }), []);
        return React.createElement('div', {
          'data-testid': 'details',
          'data-media-id': props.media.mediaId,
          'data-source-status': props.preparation?.state ?? 'checking',
          'data-quality': props.preparation?.source?.quality,
          'data-warmup': props.preparation?.warmup?.state,
        });
      }
    ),
  };
});

import { progressApi } from '@features/progress/api/progress.api';
import { homeNavigationSlice, initialHomeNavigationState } from '@store/slices/homeNavigation';

import { homeMountedRows } from './home-layout';
import HomePage from './HomePage';

const categories = [
  { id: 1, name: 'First', slug: 'first' },
  { id: 2, name: 'Second', slug: 'second' },
  { id: 3, name: 'Third', slug: 'third' },
  { id: 4, name: 'Fourth', slug: 'fourth' },
  { id: 5, name: 'Fifth', slug: 'fifth' },
  { id: 6, name: 'Sixth', slug: 'sixth' },
  { id: 7, name: 'Seventh', slug: 'seventh' },
];

const makeHandle = (focusResult: boolean, empty: boolean) => ({
  focusIndex: vi.fn(() => focusResult),
  isEmpty: vi.fn(() => empty),
  handleAction: vi.fn(() => ({ type: 'ignored' as const })),
  getNavigationContext: vi.fn(() => ({ selected: null, left: null, right: null })),
});

describe('HomePage focus transitions', () => {
  beforeEach(() => {
    navigate({ type: 'home' }, { replace: true });
    dispatch.mockReset();
    dispatch.mockImplementation(action => {
      if (typeof action === 'object' && action && 'type' in action) {
        homeNavigationState.value = homeNavigationSlice.reducer(homeNavigationState.value, action);
      }
      homeNavigationState.revision += 1;
      homeNavigationState.listeners.forEach(listener => listener());
      return action;
    });
    homeNavigationState.value = { ...initialHomeNavigationState, selectedByCategory: {} };
    homeNavigationState.revision = 0;
    homeNavigationState.listeners.clear();
    realtimeState.ready = false;
    realtimeState.preparationByMediaId = {};
    heroControls.ready = null;
    initiateMovie.mockReset();
    initiateShow.mockReset();
    const baseState = { mediaApi: {}, progressApi: {} };
    selectSession.mockReset().mockImplementation(selector => selector(baseState));
    currentSession.mockReset().mockReturnValue(null);
    currentUser.mockReset().mockReturnValue(null);
    getAssociation.mockReset().mockResolvedValue({ data: { connected: true } });
    window.localStorage.clear();
    window.sessionStorage.clear();
    removeIntent.mockReset();
    useUpdateIntentMutation.mockReturnValue([vi.fn(), {}]);
    rowHandles.clear();
    rowProps.clear();
    mediaIndexes.clear();
    useGetListsInfiniteQuery.mockReset().mockReturnValue({
      data: { pages: [{ results: categories, totalPages: 1 }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      isError: false,
    });
    useGetMovieQuery.mockReset().mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useGetShowQuery.mockReset().mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useGetSeasonQuery.mockReset().mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      isSuccess: false,
    });
    useGetNotificationsQuery.mockReset().mockReturnValue({
      data: { notifications: [], unreadCount: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useMarkNotificationReadMutation.mockReset().mockReturnValue([markNotificationRead]);
    markNotificationRead.mockReset();
    detailsHandleAction.mockReset().mockReturnValue({ type: 'escape', direction: 'left' });
  });

  it('opens the sidebar notification overlay, marks items read, and restores focus', async () => {
    useGetNotificationsQuery.mockReturnValue({
      data: {
        unreadCount: 1,
        notifications: [
          {
            id: 5,
            type: 'tv_episode_available',
            mediaType: 'tv',
            mediaId: 9001,
            title: 'Show',
            message: 'S01E08 is ready to watch.',
            seasonNumber: 1,
            episodeNumber: 8,
            createdAt: '2026-10-12T00:00:00.000Z',
            readAt: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<HomePage />);
    const notificationButton = screen.getByRole('button', { name: 'Notifications, 1 unread' });
    fireEvent.click(notificationButton);

    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show.*S01E08 is ready to watch/ }));
    expect(markNotificationRead).toHaveBeenCalledWith(5);
    fireEvent.click(screen.getByRole('button', { name: 'Close notifications' }));
    await waitFor(() => expect(notificationButton).toHaveFocus());
  });

  it('waits for the current row and hero artwork before releasing the intro', async () => {
    const onHydrated = vi.fn();
    render(<HomePage interactive={false} onHydrated={onHydrated} />);

    expect(useGetListsInfiniteQuery).toHaveBeenCalledWith({ limit: 20 }, { skip: false });
    expect(screen.getByTestId('card-0')).toHaveAttribute('data-active', 'false');
    expect(screen.getByTestId('hero')).toHaveAttribute('data-media-id', '100');
    expect(screen.queryByRole('dialog', { name: 'Connect Trakt' })).not.toBeInTheDocument();
    expect(onHydrated).not.toHaveBeenCalled();

    await act(async () => heroControls.ready?.(100));
    await waitFor(() => expect(onHydrated).toHaveBeenCalledTimes(1));
  });

  it('loads a directly addressed movie route without loading the category feed', () => {
    useGetListsInfiniteQuery.mockReturnValue({
      data: undefined,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      isError: false,
    });
    useGetMovieQuery.mockReturnValue({
      data: {
        type: 'movie',
        id: 7,
        mediaId: 789,
        imdbId: null,
        title: 'Direct title',
        overview: 'Overview',
        tagline: '',
        releaseDate: '',
        runtime: 90,
        poster: '',
        backdrop: '',
        backdropFocus: null,
        logo: '',
        genres: [],
        popularity: 0,
        rating: 0,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    navigate({ type: 'movieDetails', mediaId: 789 }, { replace: true });
    render(<HomePage />);
    expect(useGetListsInfiniteQuery).toHaveBeenCalledWith({ limit: 20 }, { skip: true });
    expect(useGetMovieQuery).toHaveBeenCalledWith(789);
    expect(screen.getByTestId('details')).toHaveAttribute('data-media-id', '789');
    const mapAction = dispatch.mock.calls
      .map(([action]) => action as { type?: string; payload?: unknown })
      .find(action => action.type === 'realtimeRuntime/publishMapRequested');
    const focusAction = dispatch.mock.calls
      .map(([action]) => action as { type?: string; payload?: unknown })
      .find(action => action.type === 'realtimeRuntime/publishFocusRequested');
    expect(mapAction?.payload).toMatchObject({ center: null, mediaIds: [], visible: [] });
    expect(focusAction?.payload).toMatchObject({
      view: 'details',
      media: { kind: 'movie', mediaId: 789 },
    });
  });

  it('opens a show after a movie even while the skipped movie query retains cached data', () => {
    useGetMovieQuery.mockReturnValue({ data: { mediaId: 789, title: 'Previous movie' } });
    useGetShowQuery.mockReturnValue({
      data: { mediaId: 42, title: 'Selected show', seasons: [], genres: [] },
    });
    render(<HomePage route={{ type: 'showDetails', mediaId: 42 }} />);
    expect(screen.getByTestId('details')).toHaveAttribute('data-media-id', '42');
  });

  it.each([
    ['Close Trakt dialog', false],
    ['Don’t ask again', true],
  ] as const)(
    'keeps the dismissal scope for %s across page reloads and logins',
    async (label, permanent) => {
      const state = { mediaApi: {}, progressApi: {} };
      const emptyProgress: never[] = [];
      currentSession.mockReturnValue('test-session');
      currentUser.mockReturnValue({ id: 'test-user' });
      selectSession.mockImplementation((selector: (state: unknown) => unknown) => selector(state));
      getAssociation.mockResolvedValue({ data: { connected: false } });
      const progressSelector = vi
        .spyOn(progressApi.endpoints.getProgress, 'select')
        .mockReturnValue((() => ({ data: { progress: emptyProgress } })) as never);
      try {
        let view = render(<HomePage />);
        expect(
          await screen.findByRole('dialog', { name: 'Connect Trakt' }, { timeout: 6500 })
        ).toBeInTheDocument();
        expect(getAssociation).toHaveBeenCalledWith('test-session');
        fireEvent.click(screen.getByRole('button', { name: label }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(window.sessionStorage.getItem('miauflix:trakt:not-now:test-session')).toBe(null);
        expect(window.localStorage.getItem('miauflix:trakt:dont-ask:test-user')).toBe(
          permanent ? '1' : null
        );
        // Reloading the page keeps the same authenticated session.
        view.unmount();
        view = render(<HomePage />);
        await waitFor(() => expect(getAssociation).toHaveBeenCalledTimes(2));
        if (permanent) {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        } else {
          expect(
            await screen.findByRole('dialog', { name: 'Connect Trakt' }, { timeout: 6500 })
          ).toBeInTheDocument();
          fireEvent.click(screen.getByRole('button', { name: label }));
        }
        currentSession.mockReturnValue(null);
        view.rerender(<HomePage />);
        currentSession.mockReturnValue('new-session');
        view.rerender(<HomePage />);
        await waitFor(() => expect(getAssociation).toHaveBeenLastCalledWith('new-session'));
        if (permanent) {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        } else {
          expect(
            await screen.findByRole('dialog', { name: 'Connect Trakt' }, { timeout: 6500 })
          ).toBeInTheDocument();
        }
      } finally {
        progressSelector.mockRestore();
      }
    },
    30_000
  );

  it('postpones the Trakt prompt while handled navigation keys keep arriving', async () => {
    vi.useFakeTimers();
    const state = { mediaApi: {}, progressApi: {} };
    const emptyProgress: never[] = [];
    currentSession.mockReturnValue('test-session');
    currentUser.mockReturnValue({ id: 'test-user' });
    selectSession.mockImplementation((selector: (state: unknown) => unknown) => selector(state));
    getAssociation.mockResolvedValue({ data: { connected: false } });
    const row = makeHandle(true, false);
    row.handleAction.mockReturnValue({ type: 'handled' } as never);
    rowHandles.set(0, row);
    const progressSelector = vi
      .spyOn(progressApi.endpoints.getProgress, 'select')
      .mockReturnValue((() => ({ data: { progress: emptyProgress } })) as never);
    const view = render(<HomePage />);
    try {
      await act(async () => {});
      expect(getAssociation).toHaveBeenCalledWith('test-session');
      for (let press = 0; press < 3; press++) {
        act(() => vi.advanceTimersByTime(4000));
        fireEvent.keyDown(screen.getByRole('main'), { key: 'ArrowRight' });
      }
      // Each handled key stops propagation at the document; it must still reset the idle timer.
      expect(row.handleAction).toHaveBeenCalledTimes(3);
      act(() => vi.advanceTimersByTime(4000));
      expect(screen.queryByRole('dialog', { name: 'Connect Trakt' })).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole('dialog', { name: 'Connect Trakt' })).toBeInTheDocument();
    } finally {
      view.unmount();
      progressSelector.mockRestore();
      vi.useRealTimers();
    }
  });

  it(
    'keeps keyboard input and focus in the Trakt modal until dismissal',
    { timeout: 15000 },
    async () => {
      const state = { mediaApi: {}, progressApi: {} };
      const emptyProgress: never[] = [];
      currentSession.mockReturnValue('test-session');
      currentUser.mockReturnValue({ id: 'test-user' });
      selectSession.mockImplementation((selector: (state: unknown) => unknown) => selector(state));
      getAssociation.mockResolvedValue({ data: { connected: false } });
      const row = makeHandle(true, false);
      rowHandles.set(0, row);
      const progressSelector = vi
        .spyOn(progressApi.endpoints.getProgress, 'select')
        .mockReturnValue((() => ({ data: { progress: emptyProgress } })) as never);
      try {
        render(<HomePage />);
        const background = screen.getByTestId('card-0');
        background.focus();
        await screen.findByRole('dialog', { name: 'Connect Trakt' }, { timeout: 6500 });
        const first = screen.getByRole('button', { name: "Let's go" });
        const close = screen.getByRole('button', { name: 'Close Trakt dialog' });
        const never = screen.getByRole('button', { name: 'Don’t ask again' });
        await waitFor(() => expect(first).toHaveFocus());
        // A late-loading carousel must not be able to reclaim keyboard focus.
        background.focus();
        expect(first).toHaveFocus();
        fireEvent.keyDown(screen.getByRole('main'), { key: 'ArrowRight' });
        expect(row.handleAction).not.toHaveBeenCalled();
        fireEvent.keyDown(first, { key: 'ArrowRight' });
        expect(never).toHaveFocus();
        fireEvent.keyDown(never, { key: 'Tab' });
        expect(close).toHaveFocus();
        fireEvent.keyDown(close, { key: 'Tab' });
        expect(first).toHaveFocus();
        fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
        expect(close).toHaveFocus();
        fireEvent.keyDown(close, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await waitFor(() => expect(background).toHaveFocus());
        fireEvent.keyDown(background, { key: 'ArrowRight' });
        expect(row.handleAction).toHaveBeenCalledTimes(1);
      } finally {
        progressSelector.mockRestore();
      }
    }
  );

  it('keeps Continue Watching stable and opens details when selected', () => {
    const state = { mediaApi: {}, progressApi: {} };
    const updateIntent = vi.fn();
    currentSession.mockReturnValue('test-session');
    useUpdateIntentMutation.mockReturnValue([updateIntent, {}]);
    const progress = [
      {
        playable: { kind: 'movie', mediaId: 100 },
        state: 'watching',
        positionSeconds: 60,
        durationSeconds: 600,
        updatedAt: '2026-10-03T00:00:00Z',
      },
    ];
    const progressSelector = vi
      .spyOn(progressApi.endpoints.getProgress, 'select')
      .mockReturnValue((() => ({ data: { progress } })) as never);
    selectMovie.mockReturnValue(() => ({ data: { id: 1, mediaId: 100, title: 'Saved movie' } }));
    selectSession.mockImplementation((selector: (state: unknown) => unknown) => selector(state));
    try {
      // Only the rows around the focused one are mounted.
      const mountedRows = homeMountedRows(0, 0, categories.length + 1).length;
      const view = render(<HomePage />);
      expect(screen.getAllByTestId(/^card-/)).toHaveLength(mountedRows);
      view.rerender(<HomePage />);
      expect(screen.getAllByTestId(/^card-/)).toHaveLength(mountedRows);
      expect(updateIntent).toHaveBeenCalledTimes(1);
      // Unrelated catalog cache updates recreate card DTOs without changing focus.
      for (let update = 0; update < 3; update += 1) {
        state.mediaApi = {};
        view.rerender(<HomePage />);
      }
      expect(updateIntent).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByTestId('card-0'));
      expect(screen.getByTestId('details')).toBeInTheDocument();
      expect(screen.queryByTestId('player')).not.toBeInTheDocument();
    } finally {
      progressSelector.mockRestore();
    }
  });

  it('subscribes to Continue Watching titles and releases them when progress changes or the page unmounts', () => {
    const state = { mediaApi: {}, progressApi: {} };
    let progress = [
      {
        playable: { kind: 'movie', mediaId: 100 },
        state: 'watching',
        positionSeconds: 60,
        durationSeconds: 600,
        updatedAt: '2026-10-03T00:00:00Z',
      },
      {
        playable: { kind: 'episode', showMediaId: 200, season: 1, episode: 2 },
        state: 'watching',
        positionSeconds: 60,
        durationSeconds: 600,
        updatedAt: '2026-10-02T00:00:00Z',
      },
    ];
    const progressSelector = vi
      .spyOn(progressApi.endpoints.getProgress, 'select')
      .mockReturnValue((() => ({ data: { progress } })) as never);
    const movieSubscription = { unsubscribe: vi.fn() };
    const showSubscription = { unsubscribe: vi.fn() };
    initiateMovie.mockReturnValue(movieSubscription);
    initiateShow.mockReturnValue(showSubscription);
    dispatch.mockImplementation(action => action);
    selectMovie.mockReturnValue(() => ({}));
    selectSession.mockImplementation((selector: (state: unknown) => unknown) => selector(state));
    try {
      const view = render(<HomePage />);
      expect(initiateMovie).toHaveBeenCalledWith(100);
      expect(initiateShow).toHaveBeenCalledWith(200);
      expect(movieSubscription.unsubscribe).not.toHaveBeenCalled();
      expect(showSubscription.unsubscribe).not.toHaveBeenCalled();
      state.mediaApi = {};
      view.rerender(<HomePage />);
      expect(initiateMovie).toHaveBeenCalledTimes(1);
      // A fresh progress response with the same watched titles must retain the subscriptions.
      progress = [...progress];
      view.rerender(<HomePage />);
      expect(initiateMovie).toHaveBeenCalledTimes(1);
      const savedProgress = progress;
      progress = [];
      view.rerender(<HomePage />);
      expect(movieSubscription.unsubscribe).toHaveBeenCalledTimes(1);
      expect(showSubscription.unsubscribe).toHaveBeenCalledTimes(1);
      progress = savedProgress;
      view.rerender(<HomePage />);
      view.unmount();
      expect(movieSubscription.unsubscribe).toHaveBeenCalledTimes(2);
      expect(showSubscription.unsubscribe).toHaveBeenCalledTimes(2);
    } finally {
      progressSelector.mockRestore();
    }
  });

  it('collapses the sidebar on mouse leave and restores the selected carousel item', () => {
    const row = makeHandle(true, false);
    rowHandles.set(0, row);
    mediaIndexes.set(0, 4);
    render(<HomePage />);
    fireEvent.mouseEnter(screen.getByTestId('card-0'));

    const sidebar = screen.getByRole('complementary', { name: 'Home navigation' });
    for (let visit = 0; visit < 2; visit += 1) {
      fireEvent.mouseEnter(sidebar);
      expect(screen.getByText('Home', { selector: 'span' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Home' })).toHaveFocus();
      expect(screen.getByTestId('card-0')).toHaveAttribute('data-active', 'false');

      fireEvent.mouseLeave(sidebar);
      expect(screen.queryByText('Home', { selector: 'span' })).not.toBeInTheDocument();
      expect(screen.getByTestId('card-0')).toHaveAttribute('data-active', 'true');
      expect(row.focusIndex).toHaveBeenLastCalledWith(4);
    }
  });

  it('keeps keyboard entry and return from the sidebar working', () => {
    const row = makeHandle(true, false);
    row.handleAction.mockReturnValue({ type: 'escape', direction: 'left' });
    rowHandles.set(0, row);
    render(<HomePage />);

    fireEvent.keyDown(screen.getByRole('main'), { key: 'ArrowLeft' });
    const home = screen.getByRole('button', { name: 'Home' });
    expect(home).toHaveFocus();
    expect(screen.getByText('Home', { selector: 'span' })).toBeInTheDocument();
    fireEvent.keyDown(home, { key: 'Escape' });
    expect(screen.queryByText('Home', { selector: 'span' })).not.toBeInTheDocument();
    expect(row.focusIndex).toHaveBeenCalledWith(0);
  });

  it('shows the preparation result for the selected movie', () => {
    currentSession.mockReturnValue('test-session');
    useUpdateIntentMutation.mockReturnValue([
      vi.fn(),
      {
        data: { preparation: { playable: { kind: 'movie', mediaId: 100 }, state: 'source_found' } },
      },
    ]);
    render(<HomePage />);
    fireEvent.click(screen.getByTestId('card-0'));
    expect(screen.getByTestId('details')).toHaveAttribute('data-source-status', 'source_found');
  });

  it('does not treat an accepted intent as a discovered source', () => {
    useUpdateIntentMutation.mockReturnValue([
      vi.fn(),
      {
        data: { acceptedSequence: 1, expiresAt: new Date().toISOString(), preparation: null },
      },
    ]);
    render(<HomePage />);
    fireEvent.click(screen.getByTestId('card-0'));
    expect(screen.getByTestId('details')).toHaveAttribute('data-source-status', 'checking');
  });

  it('does not show another movie’s preparation result', () => {
    useUpdateIntentMutation.mockReturnValue([
      vi.fn(),
      {
        data: { preparation: { playable: { kind: 'movie', mediaId: 999 }, state: 'source_found' } },
      },
    ]);
    render(<HomePage />);
    fireEvent.click(screen.getByTestId('card-0'));
    expect(screen.getByTestId('details')).toHaveAttribute('data-source-status', 'checking');
  });

  it('shows discovered source metadata in the homepage hero', () => {
    currentSession.mockReturnValue('test-session');
    useUpdateIntentMutation.mockReturnValue([
      vi.fn(),
      {
        data: {
          preparation: {
            playable: { kind: 'movie', mediaId: 100 },
            state: 'source_found',
            source: { quality: 'FHD' },
          },
        },
      },
    ]);
    render(<HomePage />);
    fireEvent.mouseEnter(screen.getByTestId('card-0'));
    expect(screen.getByTestId('hero')).toHaveAttribute('data-source-status', 'source_found');
    expect(screen.getByTestId('hero')).toHaveAttribute('data-quality', 'FHD');
  });

  it('clears preparation results when the active session changes', () => {
    currentSession.mockReturnValue('first-session');
    useUpdateIntentMutation.mockReturnValue([
      vi.fn(),
      {
        data: {
          preparation: {
            playable: { kind: 'movie', mediaId: 100 },
            state: 'source_found',
            source: { quality: 'FHD' },
          },
        },
        reset: vi.fn(),
      },
    ]);
    const view = render(<HomePage />);
    fireEvent.mouseEnter(screen.getByTestId('card-0'));
    expect(screen.getByTestId('hero')).toHaveAttribute('data-source-status', 'source_found');

    currentSession.mockReturnValue('second-session');
    view.rerender(<HomePage />);
    expect(screen.getByTestId('hero')).toHaveAttribute('data-source-status', 'checking');
    expect(dispatch).toHaveBeenCalledWith({ type: 'notificationsApi/resetApiState' });
  });

  it('shows cached source metadata immediately when returning to a movie and replaces it after refresh', () => {
    currentSession.mockReturnValue('test-session');
    const updateIntent = vi.fn();
    const initial = {
      playable: { kind: 'movie', mediaId: 100 },
      state: 'source_found',
      source: { id: 9, quality: 'HD', sourceType: 'WEB' },
      warmup: { state: 'ready' },
    };
    useUpdateIntentMutation.mockReturnValue([updateIntent, { data: { preparation: initial } }]);
    const view = render(<HomePage />);
    fireEvent.mouseEnter(screen.getByTestId('card-0'));
    expect(screen.getByTestId('hero')).toHaveAttribute('data-quality', 'HD');
    fireEvent.mouseEnter(screen.getByTestId('card-1'));
    useUpdateIntentMutation.mockReturnValue([
      updateIntent,
      {
        data: {
          preparation: {
            playable: { kind: 'movie', mediaId: 101 },
            state: 'checking',
            source: null,
            warmup: { state: 'not_requested' },
          },
        },
      },
    ]);
    view.rerender(<HomePage />);
    fireEvent.mouseEnter(screen.getByTestId('card-0'));
    expect(screen.getByTestId('hero')).toHaveAttribute('data-source-status', 'source_found');
    expect(screen.getByTestId('hero')).toHaveAttribute('data-quality', 'HD');
    expect(screen.getByTestId('hero')).toHaveAttribute('data-warmup', 'not_requested');
    useUpdateIntentMutation.mockReturnValue([
      updateIntent,
      {
        data: {
          preparation: {
            ...initial,
            source: { ...initial.source, quality: 'FHD' },
            warmup: { state: 'not_requested' },
          },
        },
      },
    ]);
    view.rerender(<HomePage />);
    expect(screen.getByTestId('hero')).toHaveAttribute('data-quality', 'FHD');
    useUpdateIntentMutation.mockReturnValue([
      updateIntent,
      { data: { preparation: { ...initial, state: 'no_source', source: null } } },
    ]);
    view.rerender(<HomePage />);
    expect(screen.getByTestId('hero')).not.toHaveAttribute('data-quality');
    fireEvent.mouseEnter(screen.getByTestId('card-1'));
    useUpdateIntentMutation.mockReturnValue([updateIntent, {}]);
    view.rerender(<HomePage />);
    fireEvent.mouseEnter(screen.getByTestId('card-0'));
    expect(screen.getByTestId('hero')).toHaveAttribute('data-source-status', 'checking');
    expect(screen.getByTestId('hero')).not.toHaveAttribute('data-quality');
  });

  it('polls discovery and escalates to details without removing its lease', () => {
    vi.useFakeTimers();
    currentSession.mockReturnValue('session');
    const updateIntent = vi.fn();
    useUpdateIntentMutation.mockReturnValue([updateIntent, {}]);
    const view = render(<HomePage />);
    try {
      fireEvent.mouseEnter(screen.getByTestId('card-0'));
      expect(updateIntent).toHaveBeenLastCalledWith(
        expect.objectContaining({ intent: expect.objectContaining({ view: 'browse' }) })
      );
      act(() => vi.advanceTimersByTime(5000));
      expect(updateIntent).toHaveBeenCalledTimes(2);
      fireEvent.click(screen.getByTestId('card-0'));
      expect(updateIntent).toHaveBeenLastCalledWith(
        expect.objectContaining({ intent: expect.objectContaining({ view: 'details' }) })
      );
      expect(removeIntent).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
    expect(removeIntent).toHaveBeenCalledTimes(1);
  });

  it('activates a pending adjacent row instead of skipping it', () => {
    const first = makeHandle(true, false);
    const pending = makeHandle(false, false);
    rowHandles.set(0, first);
    rowHandles.set(1, pending);
    rowHandles.set(2, makeHandle(true, false));
    first.handleAction.mockReturnValue({ type: 'escape', direction: 'down' });

    render(<HomePage />);
    fireEvent.keyDown(screen.getByRole('main'), { key: 'ArrowDown' });

    expect(pending.focusIndex).toHaveBeenCalledWith(0);
    expect(screen.getByTestId('card-1')).toHaveAttribute('data-active', 'true');
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('skips a confirmed empty row in favor of the next destination', () => {
    const first = makeHandle(true, false);
    const empty = makeHandle(false, true);
    const next = makeHandle(true, false);
    rowHandles.set(0, first);
    rowHandles.set(1, empty);
    rowHandles.set(2, next);
    first.handleAction.mockReturnValue({ type: 'escape', direction: 'down' });

    render(<HomePage />);
    fireEvent.keyDown(screen.getByRole('main'), { key: 'ArrowDown' });

    expect(empty.focusIndex).toHaveBeenCalledWith(0);
    expect(next.focusIndex).toHaveBeenCalledWith(0);
    expect(screen.getByTestId('card-2')).toHaveAttribute('data-active', 'true');
  });

  it('restores the saved media index after details remounts browse content', async () => {
    const first = makeHandle(true, false);
    rowHandles.set(0, first);
    rowHandles.set(1, makeHandle(true, false));
    mediaIndexes.set(0, 4);

    render(<HomePage />);
    fireEvent.click(screen.getByTestId('card-0'));
    expect(screen.getByTestId('details')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('main'), { key: 'Backspace' });

    await waitFor(() => expect(first.focusIndex).toHaveBeenCalledWith(4));
    expect(screen.queryByTestId('details')).not.toBeInTheDocument();
  });

  it('focuses the selected card once the categories finish loading', () => {
    // Returning from another page after the list cache expired: Home first shows its spinner.
    useGetListsInfiniteQuery.mockReturnValue({
      data: undefined,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: true,
      isError: false,
    });
    const first = makeHandle(true, false);
    rowHandles.set(0, first);
    const { rerender } = render(<HomePage />);
    expect(screen.queryByTestId('card-0')).not.toBeInTheDocument();
    expect(first.focusIndex).not.toHaveBeenCalled();

    useGetListsInfiniteQuery.mockReturnValue({
      data: { pages: [{ results: categories, totalPages: 1 }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      isError: false,
    });
    rerender(<HomePage />);

    expect(first.focusIndex).toHaveBeenCalledWith(0);
  });

  it('makes the newly reached rows visible after four ArrowDown transitions', () => {
    for (let index = 0; index < categories.length; index += 1) {
      const handle = makeHandle(true, false);
      handle.handleAction.mockReturnValue({ type: 'escape', direction: 'down' });
      rowHandles.set(index, handle);
    }

    render(<HomePage />);
    const main = screen.getByRole('main');
    for (let count = 0; count < 4; count += 1) {
      fireEvent.keyDown(main, { key: 'ArrowDown' });
    }

    expect(rowProps.get(4)).toEqual({ loadIntent: 'visible', visible: true });
    expect(rowProps.get(5)).toEqual({ loadIntent: 'visible', visible: true });
    expect(rowProps.get(0)).toEqual({ loadIntent: 'dormant', visible: false });
    expect(rowProps.get(6)).toEqual({ loadIntent: 'prefetch', visible: false });
  });

  it('renders every loaded page of lists as one ordered row collection', () => {
    useGetListsInfiniteQuery.mockReturnValue({
      data: {
        pages: [
          { results: categories.slice(0, 2), totalPages: 2 },
          { results: categories.slice(2, 3), totalPages: 2 },
        ],
      },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      isError: false,
    });

    render(<HomePage />);

    expect(screen.getAllByTestId(/^card-/).map(button => button.textContent)).toEqual([
      'Category 0',
      'Category 1',
      'Category 2',
    ]);
    expect(rowProps.get(0)).toEqual({ loadIntent: 'visible', visible: true });
    expect(rowProps.get(1)).toEqual({ loadIntent: 'visible', visible: true });
    expect(rowProps.get(2)).toEqual({ loadIntent: 'prefetch', visible: false });
  });

  it("ignores the previous route's show and season while the next episode route loads", () => {
    const season = (episodes: number[]) => ({
      episodes: episodes.map(episodeNumber => ({
        episodeNumber,
        title: `Episode ${episodeNumber}`,
      })),
    });
    const firstShow = { seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }] };
    useGetShowQuery.mockReturnValue({ data: firstShow, currentData: firstShow, isError: false });
    useGetSeasonQuery.mockImplementation(args =>
      args && typeof args === 'object' && 'showId' in args && args.showId === 1
        ? { data: season([1, 2]), currentData: season([1, 2]), isSuccess: true }
        : { data: undefined, currentData: undefined, isSuccess: false }
    );
    const { rerender } = render(
      <HomePage
        route={{ type: 'episodePlayer', showMediaId: 1, seasonNumber: 1, episodeNumber: 1 }}
      />
    );
    expect(JSON.parse(screen.getByTestId('player').dataset.nextEpisode!)).toEqual({
      kind: 'episode',
      showMediaId: 1,
      seasonNumber: 1,
      episodeNumber: 2,
    });

    // RTK Query keeps the previous arguments' result in data while the new show is fetching.
    useGetShowQuery.mockReturnValue({ data: firstShow, currentData: undefined, isError: false });
    useGetSeasonQuery.mockImplementation(() => ({
      data: season([1, 2]),
      currentData: undefined,
      isSuccess: true,
      isFetching: true,
    }));
    rerender(
      <HomePage
        route={{ type: 'episodePlayer', showMediaId: 2, seasonNumber: 1, episodeNumber: 1 }}
      />
    );

    expect(screen.getByTestId('player').dataset.nextEpisode).toBe('');
    expect(useGetSeasonQuery).not.toHaveBeenCalledWith({ showId: 2, season: 2 });
  });
});
