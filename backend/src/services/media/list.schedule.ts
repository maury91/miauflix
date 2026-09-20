import type { ConfigService } from '@mytypes/configuration';
import type { BackgroundJobSchedule } from '@services/background-job/background-job.types';

export function listSchedules(
  config: ConfigService,
  lists: ReadonlyArray<{ slug: string }>
): BackgroundJobSchedule[] {
  const intervalSeconds = Number(config.getOrThrow('REFRESH_LISTS_INTERVAL'));
  return lists.map(list => ({
    job: 'list.refresh.plan',
    id: `refresh-${list.slug}`,
    intervalSeconds,
    payload: { slug: list.slug, maxPages: 6, subjectId: 'public' },
    priority: 100,
    runOnStart: true,
  }));
}
