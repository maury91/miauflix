import type { ConfigService } from '@mytypes/configuration';
import type { BackgroundJobSchedule } from '@services/background-job/background-job.types';

export function cacheSchedules(config: ConfigService): BackgroundJobSchedule[] {
  return [
    {
      job: 'cache.cleanup',
      id: 'cache-cleanup',
      intervalSeconds: Number(config.getOrThrow('CACHE_CLEANUP_INTERVAL')),
      payload: {},
      priority: 1,
      runOnStart: false,
    },
  ];
}
