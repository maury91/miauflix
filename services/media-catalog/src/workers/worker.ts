import { Queue, Worker } from 'bunqueue-client';

import type { CatalogService } from '../catalog/catalog.service';
import type { ServiceEnv } from '../env';
import { logger } from '../logger';
import { CATALOG_JOB_QUEUES, type CatalogJobName } from './jobs';

const SCOPE = 'CatalogWorker';
/**
 * Queue workers for backend-owned schedules. The catalog never creates recurring
 * schedules; it only consumes durable jobs while its data plane is ready.
 */
export class CatalogWorkerManager {
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private stopped = false;

  constructor(
    private readonly env: ServiceEnv,
    private readonly catalog: () => CatalogService | null,
    _legacyResolveConfig?: (key: string) => string
  ) {}

  start(): void {
    if (this.env.disableBackgroundTasks) {
      logger.info(SCOPE, 'Background tasks disabled - on-demand catalog mode only');
      return;
    }
    if (this.stopped) return;
    this.startWorkers();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.pause();
  }

  async pause(): Promise<void> {
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

  private startWorkers(): void {
    if (this.workers.length > 0) return;
    const connection = this.connection();
    for (const [jobName, queueName] of Object.entries(CATALOG_JOB_QUEUES)) {
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
          lockTtlMs: 15 * 60_000,
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
}
