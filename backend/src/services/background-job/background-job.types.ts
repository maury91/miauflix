export interface BackgroundJobPayloads {
  'list.refresh.plan': { slug: string; maxPages: number };
  'list.page.stage': {
    slug: string;
    listId: number;
    generation: string;
    page: number;
    pageSize: number;
  };
  'list.generation.activate': { listId: number; generation: string };
  'source.discover': { movieId?: number; movieMediaId?: number };
  'source.metadata': { sourceId?: number };
  'source.stats': { sourceId?: number };
  'cache.cleanup': Record<string, never>;
}

export type BackgroundJobName = keyof BackgroundJobPayloads;

/**
 * Catalog maintenance jobs (hydration, change scans, season sync) are consumed by
 * the media-catalog service on its own queues (`miauflix-catalog-*`); the legacy
 * `miauflix-media-hydration` / `miauflix-catalog-scan` / `miauflix-season-hydration`
 * queues are no longer consumed here.
 */
export const BACKGROUND_JOB_QUEUES: Record<BackgroundJobName, string> = {
  'list.refresh.plan': 'miauflix-list-refresh',
  'list.page.stage': 'miauflix-list-pages',
  'list.generation.activate': 'miauflix-list-refresh',
  'source.discover': 'miauflix-source-discovery',
  'source.metadata': 'miauflix-source-metadata',
  'source.stats': 'miauflix-source-stats',
  'cache.cleanup': 'miauflix-maintenance',
};
