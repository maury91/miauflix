import { logger } from '@logger';

import { cacheSchedules } from '@services/cache/cache.schedule';
import { catalogSchedules, LEGACY_CATALOG_SCHEDULES } from '@services/catalog/catalog.schedule';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import { listSchedules } from '@services/media/list.schedule';
import type { ListService } from '@services/media/list.service';
import { sourceSchedules } from '@services/source/source.schedule';

import type { BackgroundJobService } from './background-job.service';
import type { BackgroundJobSchedule } from './background-job.types';
import { BACKGROUND_JOB_QUEUES } from './background-job.types';

const RETRY_MS = 15_000;

/** Owns schedule lifecycle; Bunqueue owns persistence and job execution. */
export class ServiceScheduleCoordinator {
  private operation: Promise<void> = Promise.resolve();
  private stopped = false;
  private enabled = true;
  private revision = 0;
  private unsubscribe: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly jobs: BackgroundJobService,
    private readonly config: ConfigurationService,
    private readonly catalog: CatalogClientService,
    private readonly lists: ListService
  ) {}

  start(enabled = true): void {
    if (this.unsubscribe) return;
    this.enabled = enabled;
    this.unsubscribe = this.catalog.subscribeStatus(() => this.reconcile());
    this.reconcile();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.revision++;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.clearRetryTimer();
    await this.operation.catch(() => undefined);
  }

  private reconcile(): void {
    const revision = ++this.revision;
    this.operation = this.operation
      .then(() => this.reconcileNow(revision))
      .then(() => this.clearRetryTimer())
      .catch(error => {
        if (this.stopped) return;
        logger.warn(
          'ServiceScheduleCoordinator',
          'Schedule reconciliation failed; retrying',
          error
        );
        this.scheduleRetry();
      });
  }

  private async reconcileNow(revision: number): Promise<void> {
    if (this.stopped) return;
    await this.jobs.connect();
    if (this.stopped || revision !== this.revision) return;

    if (!this.enabled) {
      await this.removeAllSchedules();
      return;
    }

    await this.install(sourceSchedules(this.config));
    await this.install(cacheSchedules(this.config));

    if (revision !== this.revision || !this.catalog.isReady()) {
      await this.removeCatalogSchedules();
      return;
    }

    const desiredLists = listSchedules(this.config, await this.lists.getLists());
    await this.install(catalogSchedules(this.config));
    await this.replaceListSchedules(desiredLists);
    await this.removeLegacySchedules();
  }

  private async install(schedules: BackgroundJobSchedule[]): Promise<void> {
    for (const schedule of schedules) await this.jobs.schedule(schedule);
  }

  private async replaceListSchedules(desired: BackgroundJobSchedule[]): Promise<void> {
    await this.jobs.removeSchedulesByPrefix(BACKGROUND_JOB_QUEUES['list.refresh.plan'], 'refresh-');
    await this.install(desired);
  }

  private async removeCatalogSchedules(): Promise<void> {
    for (const schedule of catalogSchedules(this.config)) {
      await this.jobs.removeSchedule(schedule.job, schedule.id);
    }
    await this.jobs.removeSchedulesByPrefix(BACKGROUND_JOB_QUEUES['list.refresh.plan'], 'refresh-');
    await this.removeLegacySchedules();
  }

  private async removeAllSchedules(): Promise<void> {
    await this.removeCatalogSchedules();
    for (const schedule of [...sourceSchedules(this.config), ...cacheSchedules(this.config)]) {
      await this.jobs.removeSchedule(schedule.job, schedule.id);
    }
  }

  private async removeLegacySchedules(): Promise<void> {
    for (const schedule of LEGACY_CATALOG_SCHEDULES) {
      await this.jobs.removeScheduleByQueue(schedule.queue, schedule.id);
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.stopped) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.reconcile();
    }, RETRY_MS);
  }

  private clearRetryTimer(): void {
    if (!this.retryTimer) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
