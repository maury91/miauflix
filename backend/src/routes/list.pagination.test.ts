import { paginate } from './list.pagination';

describe('paginate', () => {
  const items = Array.from({ length: 45 }, (_, index) => index);

  it('returns a middle page with stable metadata', () => {
    expect(paginate(items, 1, 20)).toEqual({
      results: items.slice(20, 40),
      page: 1,
      pageSize: 20,
      totalPages: 3,
    });
  });

  it('returns the partial final page and an empty out-of-range page', () => {
    expect(paginate(items, 2, 20).results).toEqual(items.slice(40));
    expect(paginate(items, 3, 20).results).toEqual([]);
  });
});
