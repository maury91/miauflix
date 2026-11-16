import type { ListResponse } from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { Button } from '@shared/design-system';
import { FocusScope, NavigationProvider } from '@shared/navigation';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
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

import { CategoryRow } from './CategoryRow';

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
  loadIntent: 'visible' as const,
  geometry: { itemWidth: 180, gap: 12, perPage: 4, peek: 54, contentWidth: 756 },
  isCurrentRow: false,
  visible,
  onActive: vi.fn(),
  onSelect: vi.fn(),
});

/** The row under the navigation layer, below a button focus starts on (or on the row). */
const layer = (row: ReactNode, startOnRow = false) => (
  <NavigationProvider>
    <FocusScope initialId={startOnRow ? 'home-row:popular' : 'outside'}>
      <Button navId="outside">Outside</Button>
      {row}
    </FocusScope>
  </NavigationProvider>
);

const press = (key: string) =>
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key });
  });

const renderedCards = () => screen.getAllByTestId(/^media-/).map(card => Number(card.textContent));

describe('CategoryRow on the Samsung TV', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom lays nothing out; the navigation layer only focuses elements on screen
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => [{}] as unknown as DOMRectList
    );
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
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders only the cards in view while off screen', () => {
    render(layer(<CategoryRow {...props(false)} />));
    expect(renderedCards()).toEqual([9, 10, 11, 12, 13, 14]);
  });

  it('renders two cards of margin past a page once it has been in view a moment', () => {
    const view = render(layer(<CategoryRow {...props(false)} />));
    view.rerender(layer(<CategoryRow {...props(true)} />));
    expect(renderedCards()).toEqual([9, 10, 11, 12, 13, 14]);

    act(() => vi.advanceTimersByTime(400));
    expect(renderedCards()).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('shows no spinner while loading off screen', () => {
    useGetListQuery.mockImplementation(() => ({
      data: undefined,
      currentData: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
    }));
    const view = render(layer(<CategoryRow {...props(false)} />));
    expect(screen.queryByText('Loading...')).toBeNull();

    view.rerender(layer(<CategoryRow {...props(true)} />));
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('marks the selection on the card only while the row holds focus', () => {
    render(layer(<CategoryRow {...props(true)} />));
    expect(screen.getByTestId('media-10')).not.toHaveAttribute('data-focused');

    press('ArrowDown');
    expect(screen.getByTestId('media-10')).toHaveAttribute('data-focused');
    press('ArrowUp');
    expect(screen.getByTestId('media-10')).not.toHaveAttribute('data-focused');
  });

  it('moves at once but reports a held run of moves once it pauses', () => {
    const onSelectionChange = vi.fn();
    const onActive = vi.fn();
    render(
      layer(
        <CategoryRow
          {...props(true)}
          isCurrentRow
          onSelectionChange={onSelectionChange}
          onActive={onActive}
        />,
        true
      )
    );
    act(() => vi.advanceTimersByTime(400));
    onActive.mockClear();

    press('ArrowRight');
    expect(onSelectionChange.mock.calls).toEqual([[11]]);
    expect(onActive).toHaveBeenLastCalledWith(0, 11, expect.objectContaining({ id: 11 }));

    for (let move = 0; move < 3; move += 1) {
      act(() => vi.advanceTimersByTime(50));
      press('ArrowRight');
    }
    expect(screen.getByTestId('media-14')).toHaveAttribute('data-focused');
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onActive).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(150));
    expect(onSelectionChange).toHaveBeenLastCalledWith(14);
    expect(onActive).toHaveBeenLastCalledWith(0, 14, expect.objectContaining({ id: 14 }));
  });

  it('reports the selection at once when a card opens right after a move', () => {
    const onSelectionChange = vi.fn();
    const onSelect = vi.fn();
    render(
      layer(
        <CategoryRow
          {...props(true)}
          isCurrentRow
          onSelectionChange={onSelectionChange}
          onSelect={onSelect}
        />,
        true
      )
    );
    press('ArrowRight');
    act(() => vi.advanceTimersByTime(50));
    press('ArrowRight');
    press('Enter');

    expect(onSelectionChange).toHaveBeenLastCalledWith(12);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }));
    expect(onSelectionChange.mock.invocationCallOrder.at(-1)).toBeLessThan(
      onSelect.mock.invocationCallOrder[0]
    );
  });

  it('reports a pending selection at once when the row is left', () => {
    const onSelectionChange = vi.fn();
    render(layer(<CategoryRow {...props(true)} onSelectionChange={onSelectionChange} />, true));
    press('ArrowRight');
    act(() => vi.advanceTimersByTime(50));
    press('ArrowRight');
    expect(onSelectionChange.mock.calls).toEqual([[11]]);

    press('ArrowUp');
    expect(onSelectionChange).toHaveBeenLastCalledWith(12);
  });

  it('goes back to the cards in view when it leaves view, unless kept warm', () => {
    const view = render(layer(<CategoryRow {...props(true)} />));
    act(() => vi.advanceTimersByTime(400));
    expect(renderedCards()).toHaveLength(8);

    view.rerender(layer(<CategoryRow {...props(false)} warm />));
    expect(renderedCards()).toHaveLength(8);

    view.rerender(layer(<CategoryRow {...props(false)} />));
    expect(renderedCards()).toEqual([9, 10, 11, 12, 13, 14]);
  });
});
