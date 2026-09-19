export type CatalogJobName =
  | 'catalog.movie-changes.scan'
  | 'catalog.show-changes.scan'
  | 'catalog.season-sync.seed';

export type CatalogJobPayloads = Record<CatalogJobName, Record<string, never>>;

export const CATALOG_JOB_QUEUES: Record<CatalogJobName, string> = {
  'catalog.movie-changes.scan': 'miauflix-catalog-movie-changes',
  'catalog.show-changes.scan': 'miauflix-catalog-show-changes',
  'catalog.season-sync.seed': 'miauflix-catalog-season-sync',
};
