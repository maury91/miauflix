import type { ConfigService } from '@mytypes/configuration';
import type { BackgroundJobSchedule } from '@services/background-job/background-job.types';
import { DEFAULT_LIST_REFRESH_PAGES } from '@services/media/list.service';

export function listSchedules(
  config: ConfigService,
  lists: ReadonlyArray<{ slug: string }>
): BackgroundJobSchedule[] {
  const intervalSeconds = Number(config.getOrThrow('REFRESH_LISTS_INTERVAL'));
  return lists.map(list => ({
    job: 'list.refresh.plan',
    id: `refresh-${list.slug}`,
    intervalSeconds,
    payload: { slug: list.slug, maxPages: DEFAULT_LIST_REFRESH_PAGES, subjectId: 'public' },
    priority: 100,
    runOnStart: true,
  }));
}
