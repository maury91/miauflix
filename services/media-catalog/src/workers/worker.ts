import { Queue, Worker } from 'bunqueue-client';

import type { CatalogService } from '../catalog/catalog.service';
import type { ServiceEnv } from '../env';
import { logger } from '../logger';
import {
  CATALOG_JOB_QUEUES,
  CATALOG_SCHEDULES,
  type CatalogJobName,
  LEGACY_SCHEDULE_CLEANUP,
} from './jobs';

const SCOPE = 'CatalogWorker';
const RETRY_MS = 15_000;

/**
 * Queue workers + persisted schedules. Connection to the broker is optional at
 * boot: when bunqueue is unreachable (or background tasks are disabled) the HTTP
 * service keeps working and the connection is retried every 15 s in the
 * background. Handlers also guard on the service being `ready`, so jobs queued
 * while standby are simply skipped.
 */
export class CatalogWorkerManager {
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private installInFlight = false;
  private refreshRequested = false;
  private stopped = false;

  constructor(
    private readonly env: ServiceEnv,
    private readonly catalog: () => CatalogService | null,
    private readonly resolveConfig: (key: string) => string
  ) {}

  start(): void {
    if (this.env.disableBackgroundTasks) {
      logger.info(SCOPE, 'Background tasks disabled - on-demand catalog mode only');
      return;
    }
    if (this.stopped) return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    // A catalog configuration apply calls start() again after activation. Workers
    // remain singleton, while the persisted upsert schedules are deliberately
    // refreshed so their intervals follow the newly applied configuration.
    this.refreshRequested = true;
    this.install();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    await Promise.all(this.workers.map(worker => worker.close()));
    this.workers.length = 0;
    for (const queue of this.queues.values()) queue.close();
    this.queues.clear();
  }

  private connection(): { host: string; port: number; token?: string } {
    return {
      host: this.env.bunqueue.host,
      port: this.env.bunqueue.port,
      token: this.env.bunqueue.token,
    };
  }

  private queue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, this.connection());
      this.queues.set(name, queue);
    }
    return queue;
  }

  private install(): void {
    if (this.installInFlight) return;
    this.installInFlight = true;
    void this.installRequested().finally(() => {
      this.installInFlight = false;
    });
  }

  private async installRequested(): Promise<void> {
    try {
      while (this.refreshRequested && !this.stopped) {
        this.refreshRequested = false;
        this.startWorkers();
        await this.installSchedules();
        await this.cleanupLegacySchedules();
        logger.info(SCOPE, 'Catalog workers and persisted schedules are ready');
      }
    } catch (error) {
      logger.warn(SCOPE, 'Bunqueue unavailable, retrying in the background', error);
      if (!this.stopped) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.refreshRequested = true;
          this.install();
        }, RETRY_MS);
      }
    }
  }

  private startWorkers(): void {
    if (this.workers.length > 0) return;
    const connection = this.connection();
    for (const [jobName, queueName] of Object.entries(CATALOG_JOB_QUEUES)) {
      const schedule = CATALOG_SCHEDULES.find(candidate => candidate.job === jobName);
      const worker = new Worker(
        queueName,
        async _job => {
          const catalog = this.catalog();
          if (!catalog) return; // standby guard: skip until the service is ready
          await this.runJob(jobName as CatalogJobName, catalog);
        },
        {
          ...connection,
          concurrency: 1,
          lockTtlMs: schedule?.leaseMs ?? 60_000,
          heartbeatIntervalS: 10,
          name: 'miauflix-media-catalog',
        }
      );
      worker.on('error', error => logger.error(SCOPE, `Bunqueue ${queueName} worker error`, error));
      this.workers.push(worker);
    }
  }

  private async runJob(job: CatalogJobName, catalog: CatalogService): Promise<void> {
    switch (job) {
      case 'catalog.movie-changes.scan':
        await catalog.syncMovies();
        break;
      case 'catalog.show-changes.scan':
        await catalog.syncTVShows();
        break;
      case 'catalog.season-sync.seed':
        await catalog.syncIncompleteSeasons();
        break;
    }
  }

  private async installSchedules(): Promise<void> {
    for (const schedule of CATALOG_SCHEDULES) {
      const intervalS = Number(this.resolveConfig(schedule.configKey)) || schedule.defaultIntervalS;
      await this.queue(CATALOG_JOB_QUEUES[schedule.job]).upsertJobScheduler(
        schedule.scheduleId,
        {
          every: intervalS * 1000,
          immediately: true,
          preventOverlap: true,
          skipMissedOnRestart: true,
        },
        {
          name: schedule.job,
          data: {},
          opts: {
            attempts: 12,
            priority: schedule.priority,
            backoff: { type: 'exponential', delay: 1000, maxDelay: 60_000 },
            durable: true,
            removeOnComplete: true,
            removeOnFail: false,
          },
        }
      );
    }
  }

  private async cleanupLegacySchedules(): Promise<void> {
    for (const legacy of LEGACY_SCHEDULE_CLEANUP) {
      try {
        await this.queue(legacy.queue).removeJobScheduler(legacy.scheduleId);
      } catch (error) {
        if (error instanceof Error && error.message === 'Cron job not found') continue;
        logger.debug(SCOPE, `Legacy schedule cleanup failed for ${legacy.scheduleId}`, error);
      }
    }
  }
}
