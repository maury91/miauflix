import type { ConfigService } from '@mytypes/configuration';
import type { BackgroundJobSchedule } from '@services/background-job/background-job.types';

export const LEGACY_CATALOG_SCHEDULES = [
  { queue: 'miauflix-catalog-scan', id: 'movie-changes' },
  { queue: 'miauflix-catalog-scan', id: 'show-changes' },
  { queue: 'miauflix-season-hydration', id: 'season-sync' },
] as const;

export function catalogSchedules(config: ConfigService): BackgroundJobSchedule[] {
  return [
    {
      job: 'catalog.movie-changes.scan',
      id: 'catalog-movie-changes',
      intervalSeconds: Number(config.getOrThrow('CATALOG_MOVIE_SYNC_INTERVAL')),
      payload: {},
      priority: 10,
      runOnStart: true,
    },
    {
      job: 'catalog.show-changes.scan',
      id: 'catalog-show-changes',
      intervalSeconds: Number(config.getOrThrow('CATALOG_SHOW_SYNC_INTERVAL')),
      payload: {},
      priority: 10,
      runOnStart: true,
    },
    {
      job: 'catalog.season-sync.seed',
      id: 'catalog-season-sync',
      intervalSeconds: Number(config.getOrThrow('CATALOG_SEASON_SYNC_INTERVAL')),
      payload: {},
      priority: 20,
      runOnStart: true,
    },
  ];
}
