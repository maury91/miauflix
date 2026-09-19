/**
 * Queue-consumed catalog maintenance jobs.
 *
 * Queue names are deliberately NEW (`miauflix-catalog-*`): stale jobs from an old
 * deployment sit in the legacy queues (`miauflix-catalog-scan`,
 * `miauflix-media-hydration`, `miauflix-season-hydration`) and are never consumed
 * by this service.
 */

export type { CatalogJobName } from '@miauflix/service-contracts';
export { CATALOG_JOB_QUEUES } from '@miauflix/service-contracts';
