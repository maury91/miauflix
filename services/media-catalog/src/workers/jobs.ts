/**
 * Queue-consumed catalog maintenance jobs.
 *
 * Queue names are deliberately NEW (`miauflix-catalog-*`): stale jobs from an old
 * deployment sit in the legacy queues (`miauflix-catalog-scan`,
 * `miauflix-media-hydration`, `miauflix-season-hydration`) and are never consumed
 * by this service.
 */

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

export interface CatalogSchedule {
  job: CatalogJobName;
  scheduleId: string;
  /** Config variable holding the interval in seconds. */
  configKey: string;
  /** Fallback interval in seconds, used when the config variable is unset. */
  defaultIntervalS: number;
  priority: number;
  leaseMs: number;
}

export const CATALOG_SCHEDULES: CatalogSchedule[] = [
  {
    job: 'catalog.movie-changes.scan',
    scheduleId: 'catalog-movie-changes',
    configKey: 'CATALOG_MOVIE_SYNC_INTERVAL',
    defaultIntervalS: 5400,
    priority: 10,
    leaseMs: 15 * 60_000,
  },
  {
    job: 'catalog.show-changes.scan',
    scheduleId: 'catalog-show-changes',
    configKey: 'CATALOG_SHOW_SYNC_INTERVAL',
    defaultIntervalS: 5400,
    priority: 10,
    leaseMs: 15 * 60_000,
  },
  {
    job: 'catalog.season-sync.seed',
    scheduleId: 'catalog-season-sync',
    configKey: 'CATALOG_SEASON_SYNC_INTERVAL',
    defaultIntervalS: 1,
    priority: 20,
    leaseMs: 2 * 60_000,
  },
];

/**
 * Legacy schedule ids installed by old backend deployments. They keep enqueueing
 * jobs into queues nobody consumes anymore — remove them once, then delete this
 * block after one release.
 */
export const LEGACY_SCHEDULE_CLEANUP = [
  { queue: 'miauflix-catalog-scan', scheduleId: 'movie-changes' },
  { queue: 'miauflix-catalog-scan', scheduleId: 'show-changes' },
  { queue: 'miauflix-season-hydration', scheduleId: 'season-sync' },
] as const;
