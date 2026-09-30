export type CatalogJobName =
  | 'catalog.movie-changes.scan'
  | 'catalog.show-changes.scan'
  | 'catalog.season-sync.seed';

export interface CatalogJobPayloads {
  'catalog.movie-changes.scan': Record<string, never>;
  'catalog.show-changes.scan': Record<string, never>;
  'catalog.season-sync.seed': { tvMediaId?: number; priority?: number };
}

export const CATALOG_JOB_QUEUES: Record<CatalogJobName, string> = {
  'catalog.movie-changes.scan': 'miauflix-catalog-movie-changes',
  'catalog.show-changes.scan': 'miauflix-catalog-show-changes',
  'catalog.season-sync.seed': 'miauflix-catalog-season-sync',
};
