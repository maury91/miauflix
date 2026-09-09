import { logger } from '@logger';
import { Worker } from 'bunqueue-client';

import type { BackgroundJobService } from './background-job.service';
import {
  BACKGROUND_JOB_QUEUES,
  type BackgroundJobName,
  type BackgroundJobPayloads,
} from './background-job.types';

export interface BackgroundJobHandler<K extends BackgroundJobName> {
  concurrency: number;
  leaseMs?: number;
  run(payload: BackgroundJobPayloads[K]): Promise<void>;
}

type RegisteredHandler = BackgroundJobHandler<BackgroundJobName>;

export class BackgroundJobWorker {
  private readonly handlers = new Map<BackgroundJobName, RegisteredHandler>();
  private readonly workers: Worker[] = [];

  constructor(private readonly jobs: BackgroundJobService) {}

  register<K extends BackgroundJobName>(type: K, handler: BackgroundJobHandler<K>): void {
    this.handlers.set(type, handler as RegisteredHandler);
  }

  start(): void {
    const byQueue = new Map<string, Array<[BackgroundJobName, RegisteredHandler]>>();
    for (const entry of this.handlers) {
      const queue = BACKGROUND_JOB_QUEUES[entry[0]];
      byQueue.set(queue, [...(byQueue.get(queue) ?? []), entry]);
    }
    for (const [queue, handlers] of byQueue) {
      const concurrency = handlers.reduce((total, [, handler]) => total + handler.concurrency, 0);
      const lockTtlMs = Math.max(...handlers.map(([, handler]) => handler.leaseMs ?? 60_000));
      const worker = new Worker(
        queue,
        async job => {
          // Scheduler-created jobs carry the name as a top-level wire field, while directly added
          // jobs also expose it through Job.name. Support both official broker representations.
          const type = (job.raw.name ?? job.name) as BackgroundJobName | undefined;
          const handler = type ? this.handlers.get(type) : undefined;
          if (!handler) throw new Error(`No handler registered for ${String(type)}`);
          await handler.run(job.data as never);
        },
        {
          ...this.jobs.getConnection(),
          concurrency,
          lockTtlMs,
          // Worker registration has its own short TTL. Keep this cadence independent from the
          // potentially long job lease; job heartbeats renew active locks at the same cadence.
          heartbeatIntervalS: 10,
          name: `miauflix-${process.pid}`,
        }
      );
      worker.on('error', error =>
        logger.error('BackgroundJobWorker', `Bunqueue ${queue} worker error`, error)
      );
      this.workers.push(worker);
    }
  }

  async stop(): Promise<void> {
    await Promise.all(this.workers.map(worker => worker.close()));
    this.workers.length = 0;
  }
}
