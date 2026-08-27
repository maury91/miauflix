export interface PaginationResult<T> {
  results: T[];
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginate<T>(items: T[], page: number, pageSize: number): PaginationResult<T> {
  return {
    results: items.slice(page * pageSize, (page + 1) * pageSize),
    page,
    pageSize,
    totalPages: Math.ceil(items.length / pageSize),
  };
}
