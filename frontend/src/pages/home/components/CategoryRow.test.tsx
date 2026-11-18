import type { ListResponse } from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { FocusScope, NavigationProvider } from '@shared/navigation';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useGetListQuery, usePromoteListMediaMutation, useQueueBackdropFocusMutation } = vi.hoisted(
  () => ({
    useGetListQuery: vi.fn(),
    usePromoteListMediaMutation: vi.fn(() => [vi.fn()]),
    useQueueBackdropFocusMutation: vi.fn(() => [vi.fn()]),
  })
);

vi.mock('@features/media/api/lists.api', () => ({ usePromoteListMediaMutation }));
// Rows read pages from the cache (the home feed loads them): the reader stands in for the cache.
vi.mock('@features/home-feed/listPages', () => ({
  useListPage: useGetListQuery,
  listPageArgs: (category: string, page: number, priority = 'visible') => ({
    category,
    page,
    limit: 20,
    priority,
  }),
}));
vi.mock('@features/media/api/media.api', () => ({ useQueueBackdropFocusMutation }));
vi.mock('./MediaCard', () => ({
  MediaCard: (props: { media: { id: number }; focused: boolean; onSelect: () => void }) => (
    <button
      data-focused={props.focused || undefined}
      data-testid={`media-${props.media.id}`}
      type="button"
      onClick={props.onSelect}
    >
      {props.media.id}
    </button>
  ),
}));

import { CategoryRow, type CategoryRowHandle } from './CategoryRow';

const response = (page: number, total = 40): ListResponse =>
  ({
    page,
    pageSize: 20,
    total,
    results: Array.from({ length: Math.max(0, Math.min(20, total - page * 20)) }, (_, offset) => ({
      id: page * 20 + offset,
      mediaId: page * 20 + offset + 1000,
      _type: 'movie',
    })),
  }) as ListResponse;

let queryTotal = 40;
const STEP = 192;

const makeProps = (
  initialIndex: number,
  nearby = true,
  overrides: Partial<{
    categoryIndex: number;
    visible: boolean;
    perPage: number;
    total: number;
  }> = {}
) => {
  if (overrides.total !== undefined) queryTotal = overrides.total;
  const perPage = overrides.perPage ?? 1;
  return {
    category: { id: 1, name: 'Popular', slug: 'popular' } as never,
    categoryIndex: overrides.categoryIndex ?? 0,
    initialIndex,
    loadIntent: nearby ? ('visible' as const) : ('dormant' as const),
    geometry: {
      itemWidth: 180,
      gap: 12,
      perPage,
      peek: 54,
      contentWidth: 180 * perPage + 12 * (perPage - 1),
    },
    isCurrentRow: true,
    visible: overrides.visible ?? false,
    onActive: vi.fn(),
    onSelect: vi.fn(),
  };
};

/** Under the navigation layer, focus starting on the row (or nowhere with `focused` false). */
const layer = (row: ReactNode, focused = true) => (
  <NavigationProvider>
    <FocusScope initialId={focused ? 'home-row:popular' : undefined}>
      {focused ? null : <button type="button">Outside</button>}
      {row}
    </FocusScope>
  </NavigationProvider>
);

const press = (key: string) =>
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key });
  });

const trackOffset = () =>
  0 -
  Number(
    /translateX\((-?[\d.]+)px\)/.exec(
      (screen.getByRole('list') as HTMLElement).style.transform
    )?.[1] ?? NaN
  );

describe('CategoryRow page window', () => {
  beforeEach(() => {
    // jsdom lays nothing out; the navigation layer only focuses elements on screen
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => [{}] as unknown as DOMRectList
    );
    queryTotal = 40;
    useGetListQuery.mockReset();
    useGetListQuery.mockImplementation((query: unknown) => {
      if (query === skipToken) return { data: undefined, isLoading: false, isError: false };
      const { page } = query as { page: number };
      return {
        data: response(page, queryTotal),
        currentData: response(page, queryTotal),
        isLoading: false,
        isError: false,
      };
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reports the cards in view within the interest window', () => {
    const ref = createRef<CategoryRowHandle>();
    render(layer(<CategoryRow {...makeProps(5, true, { perPage: 6 })} ref={ref} />));
    expect(ref.current?.getInterestWindow()).toMatchObject({
      center: 5,
      visible: [5, 6, 7, 8, 9, 10],
    });
  });

  it('loads and renders the next page when the window crosses index 19', async () => {
    render(layer(<CategoryRow {...makeProps(19)} />));

    await waitFor(() => expect(screen.getByTestId('media-20')).toBeInTheDocument());
    expect(useGetListQuery).toHaveBeenCalledWith({
      category: 'popular',
      page: 1,
      limit: 20,
      priority: 'visible',
    });
  });

  it('loads the saved page and renders a restored selection on remount', async () => {
    render(layer(<CategoryRow {...makeProps(45, true, { categoryIndex: 1, total: 60 })} />));

    await waitFor(() => expect(screen.getByTestId('media-45')).toBeInTheDocument());
    expect(screen.getByTestId('media-45')).toHaveAttribute('data-focused');
    expect(useGetListQuery).toHaveBeenCalledWith({
      category: 'popular',
      page: 2,
      limit: 20,
      priority: 'visible',
    });
    expect(useGetListQuery).not.toHaveBeenCalledWith({
      category: 'popular',
      page: 0,
      limit: 20,
      priority: 'visible',
    });
  });

  it('loads the previous page when the window crosses back from index 20', async () => {
    render(layer(<CategoryRow {...makeProps(20)} />));

    await waitFor(() =>
      expect(useGetListQuery).toHaveBeenCalledWith({
        category: 'popular',
        page: 0,
        limit: 20,
        priority: 'visible',
      })
    );
    expect(screen.getByTestId('media-19')).toBeInTheDocument();
  });

  it('does not request past the last page while rendering its adjacent page', async () => {
    render(layer(<CategoryRow {...makeProps(24, true, { total: 25 })} />));

    await waitFor(() => expect(screen.getByTestId('media-24')).toBeInTheDocument());
    expect(useGetListQuery).not.toHaveBeenCalledWith({
      category: 'popular',
      page: 2,
      limit: 20,
      priority: 'visible',
    });
    expect(useGetListQuery).toHaveBeenCalledWith({
      category: 'popular',
      page: 0,
      limit: 20,
      priority: 'visible',
    });
  });

  it('does not request an adjacent page before the selection reaches the middle of its page', () => {
    render(layer(<CategoryRow {...makeProps(9)} />));

    expect(new Set(useGetListQuery.mock.calls.map(([query]) => JSON.stringify(query)))).toEqual(
      new Set([
        JSON.stringify({ category: 'popular', page: 0, limit: 20, priority: 'visible' }),
        JSON.stringify(skipToken),
      ])
    );
  });

  it('requests the next page as soon as the selection reaches the middle of its page', () => {
    render(layer(<CategoryRow {...makeProps(10)} />));

    expect(useGetListQuery).toHaveBeenCalledWith({
      category: 'popular',
      page: 1,
      limit: 20,
      priority: 'visible',
    });
  });

  it('reads the cached pages while dormant, so rows mounted above the loaded ones keep their cards', () => {
    render(layer(<CategoryRow {...makeProps(19, false)} />));

    // Reading never fetches: homeFeedMiddleware loads only the rows Home wants
    expect(useGetListQuery).toHaveBeenCalledWith({
      category: 'popular',
      page: 0,
      limit: 20,
      priority: 'prefetch',
    });
  });

  it('loads a prefetched row with the lower downstream priority tier', () => {
    render(layer(<CategoryRow {...makeProps(0, false)} loadIntent="prefetch" />));

    expect(useGetListQuery).toHaveBeenCalledWith({
      category: 'popular',
      page: 0,
      limit: 20,
      priority: 'prefetch',
    });
  });

  it('shows a failed current page instead of rendering retained data from another page', () => {
    useGetListQuery.mockImplementation((query: unknown) => {
      if (query === skipToken)
        return { data: undefined, currentData: undefined, isLoading: false, isError: false };
      const { page } = query as { page: number };
      if (page === 1)
        return { data: response(0), currentData: undefined, isLoading: false, isError: true };
      return {
        data: response(page),
        currentData: response(page),
        isLoading: false,
        isError: false,
      };
    });

    render(layer(<CategoryRow {...makeProps(20)} />));

    expect(screen.getByText('Failed to load content.')).toBeInTheDocument();
    expect(screen.queryByTestId('media-19')).not.toBeInTheDocument();
  });

  it('says a loaded empty row is empty, and leaves it out of the navigation', () => {
    render(layer(<CategoryRow {...makeProps(0, true, { total: 0 })} />));

    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Popular' })).not.toBeInTheDocument();
  });

  it('shows loading, not an empty row, before its page is requested', () => {
    useGetListQuery.mockImplementation(() => ({
      data: undefined,
      currentData: undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
    }));

    render(layer(<CategoryRow {...makeProps(0, true)} />));

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();
  });

  it('enters on its remembered card at the leading slot', () => {
    render(layer(<CategoryRow {...makeProps(3, true, { perPage: 2 })} />));

    expect(screen.getByTestId('media-3')).toHaveAttribute('data-focused');
    expect(screen.getByTestId('media-3')).toHaveFocus();
    expect(trackOffset()).toBe(3 * STEP);
  });

  it('holds focus while loading and lands on the remembered card once the cards arrive', async () => {
    let loaded = false;
    useGetListQuery.mockImplementation((query: unknown) => {
      if (query === skipToken || !loaded)
        return { data: undefined, isLoading: true, isError: false };
      const { page } = query as { page: number };
      return {
        data: response(page),
        currentData: response(page),
        isLoading: false,
        isError: false,
      };
    });
    const view = render(layer(<CategoryRow {...makeProps(7)} />));
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    loaded = true;
    view.rerender(layer(<CategoryRow {...makeProps(7)} />));

    await waitFor(() => expect(screen.getByTestId('media-7')).toHaveAttribute('data-focused'));
  });

  it('moves the selection one card with Left and Right, keeping it at the leading slot', () => {
    const onSelectionChange = vi.fn();
    render(
      layer(
        <CategoryRow
          {...makeProps(0, true, { visible: true, perPage: 3, total: 5 })}
          onSelectionChange={onSelectionChange}
        />
      )
    );
    expect(screen.getByTestId('media-0')).toHaveFocus();

    press('ArrowRight');
    expect(screen.getByTestId('media-1')).toHaveAttribute('data-focused');
    expect(trackOffset()).toBe(STEP);
    expect(onSelectionChange).toHaveBeenLastCalledWith(1);
    press('ArrowRight');
    press('ArrowRight');
    // The last page stays full: the track stops, the selection goes on
    expect(screen.getByTestId('media-3')).toHaveAttribute('data-focused');
    expect(trackOffset()).toBe(2 * STEP);
    press('ArrowLeft');
    press('ArrowLeft');
    press('ArrowLeft');
    expect(screen.getByTestId('media-0')).toHaveAttribute('data-focused');
    expect(trackOffset()).toBe(0);
  });

  it('opens the focused card with Enter, reporting its selection first', () => {
    const props = makeProps(0, true, { visible: true });
    const onSelectionChange = vi.fn();
    render(layer(<CategoryRow {...props} onSelectionChange={onSelectionChange} />));

    press('ArrowRight');
    press('Enter');
    expect(onSelectionChange).toHaveBeenLastCalledWith(1);
    expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 1, mediaId: 1001 }));
  });

  it('pages with the browser buttons and focuses the card landing in the leading slot', () => {
    const props = makeProps(0, true, { visible: true, perPage: 2 });
    render(layer(<CategoryRow {...props} />, false));

    fireEvent.click(screen.getByRole('button', { name: 'Next Popular items' }));

    expect(screen.getByTestId('media-2')).toHaveAttribute('data-focused');
    expect(trackOffset()).toBe(2 * STEP);
    expect(props.onActive).toHaveBeenCalledWith(0, 2, expect.objectContaining({ id: 2 }));
  });

  it('focuses a card the pointer moves onto, without scrolling', () => {
    render(layer(<CategoryRow {...makeProps(0, true, { perPage: 2 })} />, false));

    fireEvent.mouseMove(screen.getByTestId('media-1'), { clientX: 10, clientY: 10 });

    expect(screen.getByTestId('media-1')).toHaveAttribute('data-focused');
    expect(trackOffset()).toBe(0);
  });

  it('promotes the visible row and viewport media with their priority tiers', async () => {
    const promote = vi.fn();
    usePromoteListMediaMutation.mockReturnValue([promote]);

    render(layer(<CategoryRow {...makeProps(0, true, { visible: true, total: 3 })} />));

    await waitFor(() => expect(promote).toHaveBeenCalled());
    expect(promote).toHaveBeenCalledWith({
      items: [
        { mediaType: 'movie', mediaId: 1000, tier: 'visible' },
        { mediaType: 'movie', mediaId: 1001, tier: 'visible' },
        { mediaType: 'movie', mediaId: 1002, tier: 'visible' },
      ],
    });
    await waitFor(() =>
      expect(promote).toHaveBeenCalledWith({
        items: [{ mediaType: 'movie', mediaId: 1000, tier: 'viewport' }],
      })
    );
  });

  it('promotes the same viewport again only after a failed promotion', async () => {
    const viewportCalls = (promote: ReturnType<typeof vi.fn>) =>
      promote.mock.calls.filter(([arg]) => arg.items[0]?.tier === 'viewport').length;
    const props = makeProps(0, true, { visible: true, total: 3 });

    const succeeding = vi.fn(() => ({ unwrap: () => Promise.resolve({ accepted: 1 }) }));
    usePromoteListMediaMutation.mockReturnValue([succeeding]);
    const view = render(layer(<CategoryRow {...props} />));
    await waitFor(() => expect(viewportCalls(succeeding)).toBe(1));
    view.rerender(layer(<CategoryRow {...props} visible={false} />));
    view.rerender(layer(<CategoryRow {...props} />));
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(viewportCalls(succeeding)).toBe(1);
    view.unmount();

    const failing = vi.fn(() => ({ unwrap: () => Promise.reject(new Error('offline')) }));
    usePromoteListMediaMutation.mockReturnValue([failing]);
    const retry = render(layer(<CategoryRow {...props} />));
    await waitFor(() => expect(viewportCalls(failing)).toBe(1));
    retry.rerender(layer(<CategoryRow {...props} visible={false} />));
    retry.rerender(layer(<CategoryRow {...props} />));
    await waitFor(() => expect(viewportCalls(failing)).toBe(2));
  });
});
