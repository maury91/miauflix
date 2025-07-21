// Temporary API types - Phase 0 bootstrap
// These types replace the @miauflix/types imports until proper integration

export type VideoQualityStr = '2160' | '1440' | '1080' | '720';

// Category types

// Pagination
export interface Paginated<T> {
  data: T[];
  page: number;
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrev: boolean;
}
