import type { ConfigService } from '@mytypes/configuration';
import type { BackgroundJobSchedule } from '@services/background-job/background-job.types';

export function sourceSchedules(config: ConfigService): BackgroundJobSchedule[] {
  return [
    {
      job: 'source.discover',
      id: 'source-discovery-seed',
      intervalSeconds: Number(config.getOrThrow('MOVIE_SOURCE_SEARCH_INTERVAL')),
      payload: {},
      priority: 5,
      runOnStart: true,
    },
    {
      job: 'source.metadata',
      id: 'source-metadata-seed',
      intervalSeconds: Number(config.getOrThrow('SOURCE_METADATA_SEARCH_INTERVAL')),
      payload: {},
      priority: 5,
      runOnStart: true,
    },
    {
      job: 'source.stats',
      id: 'source-stats-seed',
      intervalSeconds: Number(config.getOrThrow('SOURCE_STATS_INTERVAL')),
      payload: {},
      priority: 5,
      runOnStart: true,
    },
  ];
}
