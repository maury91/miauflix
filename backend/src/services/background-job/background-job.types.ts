import type { CatalogJobPayloads } from '@miauflix/service-contracts';

export interface BackgroundJobPayloads {
  'list.refresh.plan': { slug: string; maxPages: number; subjectId: string };
  'list.page.stage': {
    slug: string;
    listId: number;
    generation: string;
    page: number;
    pageSize: number;
    subjectId: string;
  };
  'list.generation.activate': { listId: number; generation: string };
  'source.discover': { movieId?: number; movieMediaId?: number };
  'source.metadata': { sourceId?: number };
  'source.stats': { sourceId?: number };
  'cache.cleanup': Record<string, never>;
}

export type AllBackgroundJobPayloads = BackgroundJobPayloads & CatalogJobPayloads;

export type BackgroundJobName = keyof AllBackgroundJobPayloads;

export type BackgroundJobSchedule<K extends BackgroundJobName = BackgroundJobName> = {
  job: K;
  id: string;
  intervalSeconds: number;
  payload: AllBackgroundJobPayloads[K];
  priority?: number;
  runOnStart?: boolean;
};

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
  'catalog.movie-changes.scan': 'miauflix-catalog-movie-changes',
  'catalog.show-changes.scan': 'miauflix-catalog-show-changes',
  'catalog.season-sync.seed': 'miauflix-catalog-season-sync',
};
