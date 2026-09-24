import type { ListResponse } from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useGetListQuery } = vi.hoisted(() => ({ useGetListQuery: vi.fn() }));

vi.mock('@features/media/api/lists.api', () => ({ useGetListQuery }));
vi.mock('./MediaCard', () => ({
  MediaCard: ({ media }: { media: { id: number } }) => (
    <button data-testid={`media-${media.id}`} type="button">
      {media.id}
    </button>
  ),
}));

import { CategoryRow } from './CategoryRow';

const response = (page: number, total = 40): ListResponse =>
  ({
    page,
    pageSize: 20,
    total,
    results: Array.from({ length: Math.max(0, Math.min(20, total - page * 20)) }, (_, offset) => ({
      id: page * 20 + offset,
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
    mediaPerPage: 1,
    gap: 12,
    active: overrides.active ?? false,
    onActive: vi.fn(),
    onSelect: vi.fn(),
  };
};

describe('CategoryRow page window', () => {
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
    expect(useGetListQuery).toHaveBeenCalledWith({ category: 'popular', page: 1, limit: 20 });
  });

  it('loads the saved page and renders a restored selection on remount', async () => {
    render(<CategoryRow {...makeProps(45, true, { categoryIndex: 1, active: true, total: 60 })} />);

    await waitFor(() => expect(screen.getByTestId('media-45')).toBeInTheDocument());
    expect(useGetListQuery).toHaveBeenCalledWith({ category: 'popular', page: 2, limit: 20 });
    expect(useGetListQuery).not.toHaveBeenCalledWith({
      category: 'popular',
      page: 0,
      limit: 20,
    });
  });

  it('loads the previous page when the window crosses back from index 20', async () => {
    render(<CategoryRow {...makeProps(20)} />);

    await waitFor(() =>
      expect(useGetListQuery).toHaveBeenCalledWith({
        category: 'popular',
        page: 0,
        limit: 20,
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
    });
    expect(screen.getByTestId('media-19')).toBeInTheDocument();
  });

  it('does not request adjacent pages when the window stays inside the current page', () => {
    render(<CategoryRow {...makeProps(10)} />);

    expect(useGetListQuery).toHaveBeenCalledTimes(3);
    expect(useGetListQuery.mock.calls.map(([query]) => query)).toEqual([
      { category: 'popular', page: 0, limit: 20 },
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
});
