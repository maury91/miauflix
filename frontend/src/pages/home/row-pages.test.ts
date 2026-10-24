import { describe, expect, it } from 'vitest';

import { rowPagesFor, rowRenderRadius } from './row-pages';

describe('rowPagesFor', () => {
  it('loads only the first page until the total is known', () => {
    expect(rowPagesFor(0, 0)).toEqual({ page: 0, neighbour: null });
  });

  it('loads the next page once the selection reaches the middle of its page', () => {
    expect(rowPagesFor(9, 100)).toEqual({ page: 0, neighbour: null });
    expect(rowPagesFor(10, 100)).toEqual({ page: 0, neighbour: 1 });
    expect(rowPagesFor(30, 100)).toEqual({ page: 1, neighbour: 2 });
  });

  it('loads the previous page while the selection is in the first half of a later page', () => {
    expect(rowPagesFor(20, 100)).toEqual({ page: 1, neighbour: 0 });
    expect(rowPagesFor(29, 100)).toEqual({ page: 1, neighbour: 0 });
  });

  it('never asks for a page past the end of the list', () => {
    expect(rowPagesFor(15, 20)).toEqual({ page: 0, neighbour: null });
    expect(rowPagesFor(35, 40)).toEqual({ page: 1, neighbour: null });
  });
});

describe('rowRenderRadius', () => {
  it('renders a few cards past the viewport, capped at half a page', () => {
    expect(rowRenderRadius(4)).toBe(8);
    expect(rowRenderRadius(9)).toBe(10);
  });
});
