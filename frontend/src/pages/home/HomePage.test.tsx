import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useGetListsQuery,
  useGetPopularListsInfiniteQuery,
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
} = vi.hoisted(() => ({
  useGetListsQuery: vi.fn(),
  useGetPopularListsInfiniteQuery: vi.fn(),
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
}));

vi.mock('@features/integrations/api/trakt.api', () => ({
  getTraktAssociation: getAssociation,
  beginTraktAssociation: vi.fn(),
  pollTraktAssociation: vi.fn(),
}));

vi.mock('@features/media/api/lists.api', () => ({
  useGetListsQuery,
  useGetPopularListsInfiniteQuery,
}));
vi.mock('@features/media/api/media.api', () => ({
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
vi.mock('@shared/components', () => ({ Spinner: () => null }));
vi.mock('@store/slices/auth', () => ({
  selectCurrentSessionId: currentSession,
  selectCurrentUser: currentUser,
}));
vi.mock('@store/store', () => ({}));
vi.mock('react-redux', () => ({
  useDispatch: () => dispatch,
  useSelector: (selector: unknown) => selectSession(selector),
}));
vi.mock('./hooks/useMediaBoxSizes', () => ({
  useMediaBoxSizes: () => ({ mediaWidth: 180, mediaPerPage: 1, gap: 12, margin: 24 }),
}));
vi.mock('./components/CategoryRow', async () => {
  const React = await import('react');
  return {
    CategoryRow: React.forwardRef(
      (
        props: {
          categoryIndex: number;
          active: boolean;
          mediaOverride?: unknown[];
          loadIntent?: string;
          visible?: boolean;
          onActive: (categoryIndex: number, mediaIndex: number, media: unknown) => void;
          onSelect: (media: unknown) => void;
        },
        ref
      ) => {
        rowProps.set(props.categoryIndex, {
          loadIntent: props.loadIntent,
          visible: props.visible,
        });
        const { active, mediaOverride, onActive, categoryIndex } = props;
        React.useEffect(() => {
          if (active && mediaOverride?.[0]) {
            onActive(categoryIndex, 0, mediaOverride[0]);
          }
        }, [active, categoryIndex, mediaOverride, onActive]);
        const handle = rowHandles.get(props.categoryIndex);
        React.useImperativeHandle(ref, () => handle, [handle]);
        const media = {
          _type: 'movie',
          id: props.categoryIndex + 1,
          mediaId: 100 + props.categoryIndex,
        };
        const mediaIndex = mediaIndexes.get(props.categoryIndex) ?? 0;
        return React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': `card-${props.categoryIndex}`,
            'data-active': props.active,
            onMouseEnter: () => props.onActive(props.categoryIndex, mediaIndex, media),
            onClick: () => {
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
  PlayerView: () => <div data-testid="player" />,
}));
vi.mock('./components/MediaHero', async () => {
  const React = await import('react');
  return {
    MediaHero: (props: {
      preparation?: {
        state: string;
        source?: { quality: string };
        warmup?: { state: string };
      } | null;
    }) =>
      React.createElement('div', {
        'data-testid': 'hero',
        'data-source-status': props.preparation?.state ?? 'checking',
        'data-quality': props.preparation?.source?.quality,
        'data-warmup': props.preparation?.warmup?.state,
      }),
  };
});
vi.mock('./components/MediaDetails', async () => {
  const React = await import('react');
  return {
    MediaDetails: React.forwardRef(
      (
        props: {
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
          'data-source-status': props.preparation?.state ?? 'checking',
          'data-quality': props.preparation?.source?.quality,
          'data-warmup': props.preparation?.warmup?.state,
        });
      }
    ),
  };
});

import { progressApi } from '@features/progress/api/progress.api';

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
    dispatch.mockReset();
    initiateMovie.mockReset();
    initiateShow.mockReset();
    selectSession.mockReset().mockReturnValue(null);
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
    useGetListsQuery.mockReset().mockReturnValue({
      data: categories,
      isLoading: false,
      isError: false,
    });
    useGetPopularListsInfiniteQuery.mockReset().mockReturnValue({
      data: { pages: [{ results: [], totalPages: 0 }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    detailsHandleAction.mockReset().mockReturnValue({ type: 'escape', direction: 'left' });
  });

  it.each([
    ['Close Trakt dialog', false],
    ['Don’t ask again', true],
  ] as const)(
    'keeps the dismissal scope for %s across page reloads and logins',
    async (label, permanent) => {
      const state = { mediaApi: {}, progressApi: {} };
      currentSession.mockReturnValue('test-session');
      currentUser.mockReturnValue({ id: 'test-user' });
      selectSession.mockImplementation((selector: (state: unknown) => unknown) => selector(state));
      getAssociation.mockResolvedValue({ data: { connected: false } });
      const progressSelector = vi
        .spyOn(progressApi.endpoints.getProgress, 'select')
        .mockReturnValue((() => ({ data: { progress: [] } })) as never);
      try {
        let view = render(<HomePage />);
        expect(await screen.findByRole('dialog', { name: 'Connect Trakt' })).toBeInTheDocument();
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
          expect(await screen.findByRole('dialog', { name: 'Connect Trakt' })).toBeInTheDocument();
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
          expect(await screen.findByRole('dialog', { name: 'Connect Trakt' })).toBeInTheDocument();
        }
      } finally {
        progressSelector.mockRestore();
      }
    },
    15_000
  );

  it('keeps keyboard input and focus in the Trakt modal until dismissal', async () => {
    const state = { mediaApi: {}, progressApi: {} };
    currentSession.mockReturnValue('test-session');
    currentUser.mockReturnValue({ id: 'test-user' });
    selectSession.mockImplementation((selector: (state: unknown) => unknown) => selector(state));
    getAssociation.mockResolvedValue({ data: { connected: false } });
    const row = makeHandle(true, false);
    rowHandles.set(0, row);
    const progressSelector = vi
      .spyOn(progressApi.endpoints.getProgress, 'select')
      .mockReturnValue((() => ({ data: { progress: [] } })) as never);
    try {
      render(<HomePage />);
      const background = screen.getByTestId('card-0');
      background.focus();
      await screen.findByRole('dialog', { name: 'Connect Trakt' });
      const first = screen.getByRole('button', { name: "Let's go" });
      const close = screen.getByRole('button', { name: 'Close Trakt dialog' });
      const never = screen.getByRole('button', { name: 'Don’t ask again' });
      expect(first).toHaveFocus();
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
  });

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
    let selections = 0;
    selectSession.mockImplementation((selector: (state: unknown) => unknown) => {
      if (++selections > 100) throw new Error('HomePage entered a render loop');
      return selector(state);
    });
    try {
      const view = render(<HomePage />);
      expect(screen.getAllByTestId(/^card-/)).toHaveLength(categories.length + 1);
      const beforeRerender = selections;
      view.rerender(<HomePage />);
      expect(selections - beforeRerender).toBeLessThan(20);
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

  it('shows cached source metadata immediately when returning to a movie and replaces it after refresh', () => {
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
    selectSession.mockReturnValue('session');
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

  it('renders fixed and popular categories as one ordered row collection', () => {
    useGetListsQuery.mockReturnValue({
      data: [categories[0]],
      isLoading: false,
      isError: false,
    });
    useGetPopularListsInfiniteQuery.mockReturnValue({
      data: { pages: [{ results: categories.slice(1, 3), totalPages: 1 }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
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
});
