import type { ListResponse } from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { useGetListQuery, usePromoteListMediaMutation, useQueueBackdropFocusMutation } = vi.hoisted(
  () => ({
    useGetListQuery: vi.fn(),
    usePromoteListMediaMutation: vi.fn(() => [vi.fn()]),
    useQueueBackdropFocusMutation: vi.fn(() => [vi.fn()]),
  })
);

vi.mock('@features/media/api/lists.api', () => ({ useGetListQuery, usePromoteListMediaMutation }));
vi.mock('@features/media/api/media.api', () => ({ useQueueBackdropFocusMutation }));
vi.mock('./MediaCard', async () => {
  const React = await import('react');
  return {
    MediaCard: React.forwardRef(
      (
        props: {
          media: { id: number };
          selected: boolean;
          tabIndex: number;
          onFocus: () => void;
          onHover: () => void;
          onSelect: () => void;
        },
        ref
      ) => (
        <button
          ref={ref}
          aria-current={props.selected ? 'true' : undefined}
          data-testid={`media-${props.media.id}`}
          tabIndex={props.tabIndex}
          type="button"
          onFocus={props.onFocus}
          onMouseEnter={props.onHover}
          onClick={props.onSelect}
        >
          {props.media.id}
        </button>
      )
    ),
  };
});

import { CategoryRow } from './CategoryRow';

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

const makeProps = (
  initialIndex: number,
  nearby = true,
  overrides: Partial<{
    categoryIndex: number;
    active: boolean;
    visible: boolean;
    mediaPerPage: number;
    total: number;
  }> = {}
) => {
  if (overrides.total !== undefined) queryTotal = overrides.total;
  return {
    category: { id: 1, name: 'Popular', slug: 'popular' } as never,
    categoryIndex: overrides.categoryIndex ?? 0,
    initialIndex,
    nearby,
    mediaWidth: 180,
    mediaPerPage: overrides.mediaPerPage ?? 1,
    gap: 12,
    peekWidth: 54,
    active: overrides.active ?? false,
    visible: overrides.visible ?? false,
    onActive: vi.fn(),
    onSelect: vi.fn(),
  };
};

describe('CategoryRow page window', () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: function (this: HTMLElement, options: { left?: number } | number) {
        if (typeof options === 'object' && options.left !== undefined) {
          this.scrollLeft = options.left;
        }
      },
    });
  });

  beforeEach(() => {
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

  it('loads and renders the next page when the window crosses index 19', async () => {
    render(<CategoryRow {...makeProps(19)} />);

    await waitFor(() => expect(screen.getByTestId('media-20')).toBeInTheDocument());
    expect(useGetListQuery).toHaveBeenCalledWith({
      category: 'popular',
      page: 1,
      limit: 20,
      priority: 'visible',
    });
  });

  it('loads the saved page and renders a restored selection on remount', async () => {
    render(<CategoryRow {...makeProps(45, true, { categoryIndex: 1, active: true, total: 60 })} />);

    await waitFor(() => expect(screen.getByTestId('media-45')).toBeInTheDocument());
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
    render(<CategoryRow {...makeProps(20)} />);

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
    useGetListQuery.mockImplementation((query: unknown) => {
      if (query === skipToken) return { data: undefined, isLoading: false, isError: false };
      const { page } = query as { page: number };
      return {
        data: response(page, 25),
        currentData: response(page, 25),
        isLoading: false,
        isError: false,
      };
    });
    render(<CategoryRow {...makeProps(24)} />);

    await waitFor(() => expect(screen.getByTestId('media-24')).toBeInTheDocument());
    expect(useGetListQuery).not.toHaveBeenCalledWith({
      category: 'popular',
      page: 2,
      limit: 20,
      priority: 'visible',
    });
    expect(screen.getByTestId('media-19')).toBeInTheDocument();
  });

  it('does not request adjacent pages when the window stays inside the current page', () => {
    render(<CategoryRow {...makeProps(10)} />);

    expect(useGetListQuery).toHaveBeenCalledTimes(3);
    expect(useGetListQuery.mock.calls.map(([query]) => query)).toEqual([
      { category: 'popular', page: 0, limit: 20, priority: 'visible' },
      skipToken,
      skipToken,
    ]);
  });

  it('skips all page queries when nearby is false', () => {
    render(<CategoryRow {...makeProps(19, false)} />);

    expect(useGetListQuery.mock.calls.map(([query]) => query)).toEqual([
      skipToken,
      skipToken,
      skipToken,
    ]);
  });

  it('loads a prefetched row with the lower downstream priority tier', () => {
    render(<CategoryRow {...makeProps(0, false)} loadIntent="prefetch" />);

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

    render(<CategoryRow {...makeProps(20)} />);

    expect(screen.getByText('Failed to load content.')).toBeInTheDocument();
    expect(screen.queryByTestId('media-19')).not.toBeInTheDocument();
  });

  it('reports empty only after a loaded zero-total response', () => {
    const ref = createRef<import('./CategoryRow').CategoryRowHandle>();
    const { rerender } = render(<CategoryRow ref={ref} {...makeProps(0, false, { total: 0 })} />);

    expect(ref.current?.isEmpty()).toBe(false);

    rerender(<CategoryRow ref={ref} {...makeProps(0, true, { total: 0 })} />);

    expect(ref.current?.isEmpty()).toBe(true);
  });

  it('does not report a loading row as empty', () => {
    useGetListQuery.mockImplementation((query: unknown) =>
      query === skipToken
        ? { data: undefined, isLoading: false, isError: false }
        : {
            data: undefined,
            currentData: undefined,
            isLoading: true,
            isFetching: true,
            isError: false,
          }
    );
    const ref = createRef<import('./CategoryRow').CategoryRowHandle>();

    render(<CategoryRow ref={ref} {...makeProps(0, true)} />);

    expect(ref.current?.isEmpty()).toBe(false);
  });

  it('honors a pending focus request after the row data arrives', async () => {
    const ref = createRef<import('./CategoryRow').CategoryRowHandle>();
    const { rerender } = render(<CategoryRow ref={ref} {...makeProps(7, false)} />);

    expect(ref.current?.focusIndex(7)).toBe(false);
    rerender(<CategoryRow ref={ref} {...makeProps(7, true)} />);

    await waitFor(() => expect(screen.getByTestId('media-7')).toBeInTheDocument());
  });

  it('moves and confirms the selected media through its imperative handle', async () => {
    const ref = createRef<import('./CategoryRow').CategoryRowHandle>();
    const onSelect = vi.fn();
    const props = makeProps(0, true, { active: true, visible: true });
    props.onSelect = onSelect;

    render(<CategoryRow ref={ref} {...props} />);
    await waitFor(() => expect(screen.getByTestId('media-0')).toBeInTheDocument());

    act(() => {
      expect(ref.current?.handleAction('right')).toEqual({ type: 'handled' });
    });
    await waitFor(() => expect(ref.current?.getNavigationContext().selected?.id).toBe(1));
    act(() => {
      expect(ref.current?.handleAction('confirm')).toEqual({ type: 'activate' });
    });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 1, mediaId: 1001 }));
  });

  it('advances by one visible page when the browser next arrow is clicked', async () => {
    const onActive = vi.fn();
    const props = makeProps(0, true, { active: true, visible: true });
    props.onActive = onActive;

    render(<CategoryRow {...props} />);
    await waitFor(() => expect(screen.getByTestId('media-0')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Next Popular items' }));

    await waitFor(() =>
      expect(screen.getByTestId('media-1')).toHaveAttribute('aria-current', 'true')
    );
    expect(onActive).toHaveBeenCalledWith(0, 1, expect.objectContaining({ id: 1 }));
  });

  it('advances one card stride from an aligned browser scroll position', async () => {
    render(<CategoryRow {...makeProps(0, true, { active: true, visible: true })} />);
    await waitFor(() => expect(screen.getByTestId('media-0')).toBeInTheDocument());

    const scrollContainer = screen.getByTestId('media-0').parentElement as HTMLDivElement;
    expect(scrollContainer.scrollLeft).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Next Popular items' }));

    await waitFor(() =>
      expect(screen.getByTestId('media-1')).toHaveAttribute('aria-current', 'true')
    );
    expect(scrollContainer.scrollLeft).toBe(192);
  });

  it('normalizes an arbitrary scroll position before moving in the requested direction', async () => {
    render(<CategoryRow {...makeProps(0, true, { active: true, visible: true })} />);
    await waitFor(() => expect(screen.getByTestId('media-0')).toBeInTheDocument());

    const scrollContainer = screen.getByTestId('media-0').parentElement as HTMLDivElement;
    scrollContainer.scrollLeft = 100;
    fireEvent.scroll(scrollContainer);
    fireEvent.click(screen.getByRole('button', { name: 'Previous Popular items' }));
    await waitFor(() =>
      expect(screen.getByTestId('media-0')).toHaveAttribute('aria-current', 'true')
    );
    expect(scrollContainer.scrollLeft).toBe(0);

    scrollContainer.scrollLeft = 250;
    fireEvent.scroll(scrollContainer);
    fireEvent.click(screen.getByRole('button', { name: 'Previous Popular items' }));

    await waitFor(() =>
      expect(screen.getByTestId('media-1')).toHaveAttribute('aria-current', 'true')
    );
    expect(scrollContainer.scrollLeft).toBe(192);

    scrollContainer.scrollLeft = 250;
    fireEvent.scroll(scrollContainer);
    fireEvent.click(screen.getByRole('button', { name: 'Next Popular items' }));

    await waitFor(() =>
      expect(screen.getByTestId('media-2')).toHaveAttribute('aria-current', 'true')
    );
    expect(scrollContainer.scrollLeft).toBe(384);
  });

  it('keeps each keyboard-focused card at the leading carousel slot', async () => {
    const ref = createRef<import('./CategoryRow').CategoryRowHandle>();
    render(
      <CategoryRow
        ref={ref}
        {...makeProps(0, true, { active: true, visible: true, mediaPerPage: 3, total: 5 })}
      />
    );
    await waitFor(() => expect(screen.getByTestId('media-0')).toBeInTheDocument());

    const scrollContainer = screen.getByTestId('media-0').parentElement as HTMLDivElement;
    for (const expectedIndex of [1, 2, 3, 4]) {
      act(() => {
        expect(ref.current?.handleAction('right')).toEqual({ type: 'handled' });
      });
      await waitFor(() =>
        expect(ref.current?.getNavigationContext().selected?.id).toBe(expectedIndex)
      );
      expect(scrollContainer.scrollLeft).toBe(expectedIndex * 192);
    }
    for (const expectedIndex of [3, 2, 1, 0]) {
      act(() => {
        expect(ref.current?.handleAction('left')).toEqual({ type: 'handled' });
      });
      await waitFor(() =>
        expect(ref.current?.getNavigationContext().selected?.id).toBe(expectedIndex)
      );
      expect(scrollContainer.scrollLeft).toBe(expectedIndex * 192);
    }
  });

  it('promotes the visible row and viewport media with their priority tiers', async () => {
    const promote = vi.fn();
    usePromoteListMediaMutation.mockReturnValue([promote]);

    render(<CategoryRow {...makeProps(0, true, { active: true, visible: true, total: 3 })} />);

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
});
