import type { ListResponse } from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useGetListQuery, usePromoteListMediaMutation, useQueueBackdropFocusMutation } = vi.hoisted(
  () => ({
    useGetListQuery: vi.fn(),
    usePromoteListMediaMutation: vi.fn(() => [vi.fn()]),
    useQueueBackdropFocusMutation: vi.fn(() => [vi.fn()]),
  })
);

vi.mock('@shared/config/constants', async importOriginal => ({
  ...(await importOriginal<typeof import('@shared/config/constants')>()),
  builtForTizen: true,
  IS_TV: true,
}));
vi.mock('@features/media/api/lists.api', () => ({ useGetListQuery, usePromoteListMediaMutation }));
vi.mock('@features/media/api/media.api', () => ({ useQueueBackdropFocusMutation }));
// jsdom has no layout to animate; land every scroll immediately (the spring has its own tests).
vi.mock('../smooth-scroll', () => ({
  createSmoothScroller: (element: HTMLElement) => ({
    scrollTo: (target: number) => {
      element.scrollLeft = target;
    },
    stop: () => {},
    dispose: () => {},
    position: () => element.scrollLeft,
  }),
}));
vi.mock('./MediaCard', async () => {
  const React = await import('react');
  return {
    MediaCard: React.forwardRef(
      (
        props: {
          media: { id: number };
          selected: boolean;
          showFocus?: boolean;
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
          data-focused={props.showFocus === false ? undefined : props.selected || undefined}
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

import { createRef } from 'react';

import { CategoryRow, type CategoryRowHandle } from './CategoryRow';

const responses = new Map<number, ListResponse>();
/** One response object per page, as the query cache returns. */
const response = (page: number): ListResponse => {
  const cached = responses.get(page);
  if (cached) return cached;
  const created = {
    page,
    pageSize: 20,
    total: 40,
    results: Array.from({ length: 20 }, (_, offset) => ({
      id: page * 20 + offset,
      mediaId: page * 20 + offset + 1000,
      _type: 'movie',
    })),
  } as ListResponse;
  responses.set(page, created);
  return created;
};

const props = (visible: boolean) => ({
  category: { id: 1, name: 'Popular', slug: 'popular' } as never,
  categoryIndex: 0,
  initialIndex: 10,
  nearby: true,
  mediaWidth: 180,
  mediaPerPage: 4,
  gap: 12,
  peekWidth: 54,
  active: false,
  visible,
  onActive: vi.fn(),
  onSelect: vi.fn(),
});

const renderedCards = () => screen.getAllByTestId(/^media-/).map(card => Number(card.textContent));

describe('CategoryRow on the Samsung TV', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGetListQuery.mockImplementation((query: unknown) =>
      query === skipToken
        ? { data: undefined, isLoading: false, isError: false }
        : {
            data: response((query as { page: number }).page),
            currentData: response((query as { page: number }).page),
            isLoading: false,
            isError: false,
          }
    );
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders only the cards in view while off screen', () => {
    render(<CategoryRow {...props(false)} />);
    expect(renderedCards()).toEqual([9, 10, 11, 12, 13, 14]);
  });

  it('renders two cards of margin past a page once it has been in view a moment', () => {
    const view = render(<CategoryRow {...props(false)} />);
    view.rerender(<CategoryRow {...props(true)} />);
    expect(renderedCards()).toEqual([9, 10, 11, 12, 13, 14]);

    act(() => vi.advanceTimersByTime(400));
    expect(renderedCards()).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('marks the selection with one ring over the leading slot instead of on the card', () => {
    const view = render(<CategoryRow {...props(true)} />);
    const ring = screen.getByTestId('category-row-focus-ring');
    expect(ring.style.opacity).toBe('0');

    view.rerender(<CategoryRow {...props(true)} active />);
    expect(ring.style.opacity).toBe('1');
    expect(screen.getByTestId('media-10').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('media-10').hasAttribute('data-focused')).toBe(false);
  });

  it('moves at once but reports a held run of moves once it pauses', () => {
    const ref = createRef<CategoryRowHandle>();
    const onSelectionChange = vi.fn();
    const onActive = vi.fn();
    const row = (selectedIndex: number, active = true) => (
      <CategoryRow
        {...props(true)}
        ref={ref}
        active={active}
        isCurrentRow
        selectedIndex={selectedIndex}
        onSelectionChange={onSelectionChange}
        onActive={onActive}
      />
    );
    const view = render(row(10));
    act(() => vi.advanceTimersByTime(400));
    onActive.mockClear();

    act(() => void ref.current?.handleAction('right'));
    expect(onSelectionChange.mock.calls).toEqual([[11]]);
    expect(onActive).toHaveBeenLastCalledWith(0, 11, expect.objectContaining({ id: 11 }));
    view.rerender(row(11));

    for (let move = 0; move < 3; move += 1) {
      act(() => vi.advanceTimersByTime(50));
      act(() => void ref.current?.handleAction('right'));
    }
    expect(screen.getByTestId('media-14').getAttribute('aria-current')).toBe('true');
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onActive).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(150));
    expect(onSelectionChange).toHaveBeenLastCalledWith(14);
    expect(onActive).toHaveBeenLastCalledWith(0, 14, expect.objectContaining({ id: 14 }));
  });

  it('reports a pending selection at once when the row is left', () => {
    const ref = createRef<CategoryRowHandle>();
    const onSelectionChange = vi.fn();
    const row = (active: boolean) => (
      <CategoryRow
        {...props(true)}
        ref={ref}
        active={active}
        selectedIndex={10}
        onSelectionChange={onSelectionChange}
      />
    );
    const view = render(row(true));
    act(() => void ref.current?.handleAction('right'));
    act(() => void ref.current?.handleAction('right'));
    expect(onSelectionChange.mock.calls).toEqual([[11]]);

    view.rerender(row(false));
    expect(onSelectionChange).toHaveBeenLastCalledWith(12);
  });
});
