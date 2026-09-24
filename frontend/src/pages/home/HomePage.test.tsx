import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useGetListsQuery, rowHandles, mediaIndexes, detailsHandleAction } = vi.hoisted(() => ({
  useGetListsQuery: vi.fn(),
  rowHandles: new Map<number, Record<string, unknown>>(),
  mediaIndexes: new Map<number, number>(),
  detailsHandleAction: vi.fn(),
}));

vi.mock('@features/media/api/lists.api', () => ({ useGetListsQuery }));
vi.mock('@features/media/api/media.api', () => ({
  mediaApi: { util: { prefetch: vi.fn() } },
}));
vi.mock('@shared/components', () => ({ Spinner: () => null }));
vi.mock('@store/slices/auth', () => ({ selectCurrentSessionId: () => null }));
vi.mock('@store/store', () => ({}));
vi.mock('react-redux', () => ({
  useDispatch: () => vi.fn(),
  useSelector: () => null,
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
          onActive: (categoryIndex: number, mediaIndex: number, media: unknown) => void;
          onSelect: (media: unknown) => void;
        },
        ref
      ) => {
        const handle = rowHandles.get(props.categoryIndex);
        React.useImperativeHandle(ref, () => handle, [handle]);
        const media = { _type: 'movie', id: props.categoryIndex + 1, mediaId: 100 };
        const mediaIndex = mediaIndexes.get(props.categoryIndex) ?? 0;
        return React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': `card-${props.categoryIndex}`,
            'data-active': props.active,
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
vi.mock('./components/HomeSidebar', () => ({ HomeSidebar: () => null }));
vi.mock('./components/MediaHero', () => ({ MediaHero: () => null }));
vi.mock('./components/MediaDetails', async () => {
  const React = await import('react');
  return {
    MediaDetails: React.forwardRef((_props, ref) => {
      React.useImperativeHandle(ref, () => ({ handleAction: detailsHandleAction }), []);
      return React.createElement('div', { 'data-testid': 'details' });
    }),
  };
});

import HomePage from './HomePage';

const categories = [
  { id: 1, name: 'First', slug: 'first' },
  { id: 2, name: 'Second', slug: 'second' },
  { id: 3, name: 'Third', slug: 'third' },
];

const makeHandle = (focusResult: boolean, empty: boolean) => ({
  focusIndex: vi.fn(() => focusResult),
  isEmpty: vi.fn(() => empty),
  handleAction: vi.fn(() => ({ type: 'ignored' as const })),
  getNavigationContext: vi.fn(() => ({ selected: null, left: null, right: null })),
});

describe('HomePage focus transitions', () => {
  beforeEach(() => {
    rowHandles.clear();
    mediaIndexes.clear();
    useGetListsQuery.mockReset().mockReturnValue({
      data: categories,
      isLoading: false,
      isError: false,
    });
    detailsHandleAction.mockReset().mockReturnValue({ type: 'escape', direction: 'left' });
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
});
