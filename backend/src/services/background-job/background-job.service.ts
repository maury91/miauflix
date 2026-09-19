import { logger } from '@logger';
import { FlowProducer, type FlowStep, type JobOptions, Queue } from 'bunqueue-client';
import { createHash } from 'crypto';

import type { ConfigService, ServiceInstanceStatus } from '@mytypes/configuration';

import {
  type AllBackgroundJobPayloads,
  BACKGROUND_JOB_QUEUES,
  type BackgroundJobName,
  type BackgroundJobSchedule,
} from './background-job.types';

type EnqueueOptions = { maxAttempts?: number; priority?: number; runAfter?: Date };
export type BackgroundJobSpec<K extends BackgroundJobName = BackgroundJobName> = {
  type: K;
  dedupeKey: string;
  payload: AllBackgroundJobPayloads[K];
  options?: EnqueueOptions;
};

export class BackgroundJobService {
  testable = false;
  private readonly queues = new Map<string, Queue>();
  private readonly flowProducer: FlowProducer;
  private readonly connection: { host: string; port: number; token?: string };
  private status: ServiceInstanceStatus = {
    status: 'initializing',
    details: 'Waiting for the Bunqueue broker',
    startedAt: Date.now(),
  };

  constructor(config: ConfigService) {
    this.connection = {
      host: config.getOrThrow('BUNQUEUE_HOST'),
      port: config.getOrThrow('BUNQUEUE_PORT'),
      token: config.get('BUNQUEUE_TOKEN') || undefined,
    };
    this.flowProducer = new FlowProducer(this.connection);
  }

  async connect(): Promise<void> {
    try {
      await Promise.all(
        [...new Set(Object.values(BACKGROUND_JOB_QUEUES))].map(name =>
          this.getQueue(name).waitUntilReady()
        )
      );
      this.status = { status: 'ready' };
    } catch (error) {
      this.status = {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
        error,
      };
      throw error;
    }
  }

  getStatus(): ServiceInstanceStatus {
    return this.status;
  }

  async reload(): Promise<void> {
    await this.connect();
  }

  async enqueue<K extends BackgroundJobName>(
    type: K,
    dedupeKey: string,
    payload: AllBackgroundJobPayloads[K],
    options: EnqueueOptions = {}
  ): Promise<void> {
    await this.getQueue(BACKGROUND_JOB_QUEUES[type]).add(type, payload, {
      ...this.jobOptions(options),
      jobId: this.jobId(type, dedupeKey),
    });
  }

  async enqueueBulk(specs: BackgroundJobSpec[]): Promise<void> {
    const grouped = new Map<string, BackgroundJobSpec[]>();
    for (const spec of specs) {
      const queueName = BACKGROUND_JOB_QUEUES[spec.type];
      grouped.set(queueName, [...(grouped.get(queueName) ?? []), spec]);
    }
    await Promise.all(
      [...grouped].map(([queueName, jobs]) =>
        this.getQueue(queueName).addBulk(
          jobs.map(job => ({
            name: job.type,
            data: job.payload,
            opts: {
              ...this.jobOptions(job.options ?? {}),
              jobId: this.jobId(job.type, job.dedupeKey),
            },
          }))
        )
      )
    );
  }

  async addChain(specs: BackgroundJobSpec[]): Promise<void> {
    await this.flowProducer.addChain(specs.map(spec => this.flowStep(spec)));
  }

  async addFanIn(parallel: BackgroundJobSpec[], final: BackgroundJobSpec): Promise<void> {
    await this.flowProducer.addBulkThen(
      parallel.map(spec => this.flowStep(spec)),
      this.flowStep(final)
    );
  }

  enqueueBestEffort<K extends BackgroundJobName>(spec: BackgroundJobSpec<K>): void {
    void this.enqueue(spec.type, spec.dedupeKey, spec.payload, spec.options).catch(error =>
      logger.warn('BackgroundJobService', `Unable to enqueue follow-up ${spec.type}`, error)
    );
  }

  chainBestEffort(specs: BackgroundJobSpec[]): void {
    void this.addChain(specs).catch(error =>
      logger.warn('BackgroundJobService', 'Unable to enqueue follow-up flow', error)
    );
  }

  bulkBestEffort(specs: BackgroundJobSpec[]): void {
    if (!specs.length) return;
    void this.enqueueBulk(specs).catch(error =>
      logger.warn('BackgroundJobService', 'Unable to enqueue follow-up batch', error)
    );
  }

  async schedule<K extends BackgroundJobName>(schedule: BackgroundJobSchedule<K>): Promise<void> {
    await this.getQueue(BACKGROUND_JOB_QUEUES[schedule.job]).upsertJobScheduler(
      schedule.id,
      {
        every: schedule.intervalSeconds * 1000,
        immediately: schedule.runOnStart ?? true,
        preventOverlap: true,
        skipMissedOnRestart: true,
      },
      {
        name: schedule.job,
        data: schedule.payload,
        opts: this.jobOptions({ priority: schedule.priority }),
      }
    );
  }

  async removeSchedule<K extends BackgroundJobName>(type: K, scheduleId: string): Promise<void> {
    try {
      await this.getQueue(BACKGROUND_JOB_QUEUES[type]).removeJobScheduler(scheduleId);
    } catch (error) {
      if (error instanceof Error && error.message === 'Cron job not found') return;
      throw error;
    }
  }

  async removeSchedulesByPrefix(queueName: string, prefix: string): Promise<void> {
    const queue = this.getQueue(queueName);
    const schedules = await queue.getJobSchedulers();
    await Promise.all(
      schedules
        .map((schedule: { name?: string }) => schedule.name)
        .filter((name): name is string => Boolean(name?.startsWith(prefix)))
        .map(name => queue.removeJobScheduler(name))
    );
  }

  async removeScheduleByQueue(queueName: string, scheduleId: string): Promise<void> {
    try {
      await this.getQueue(queueName).removeJobScheduler(scheduleId);
    } catch (error) {
      if (error instanceof Error && /not found/i.test(error.message)) return;
      throw error;
    }
  }

  getConnection(): { host: string; port: number; token?: string } {
    return this.connection;
  }

  close(): void {
    for (const queue of this.queues.values()) queue.close();
    this.flowProducer.close();
    this.queues.clear();
    this.status = {
      status: 'initializing',
      details: 'Bunqueue connection closed',
      startedAt: Date.now(),
    };
  }

  private getQueue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, this.connection);
      this.queues.set(name, queue);
    }
    return queue;
  }

  private jobOptions(options: EnqueueOptions): JobOptions {
    return {
      attempts: options.maxAttempts ?? 12,
      priority: options.priority,
      delay: options.runAfter ? Math.max(0, options.runAfter.getTime() - Date.now()) : undefined,
      backoff: { type: 'exponential', delay: 1000, maxDelay: 60_000 },
      durable: true,
      removeOnComplete: true,
      removeOnFail: false,
    };
  }

  private jobId(type: BackgroundJobName, key: string): string {
    const digest = createHash('sha256').update(`${type}:${key}`).digest('hex').slice(0, 20);
    return `${type.replace('.', '-')}-${digest}`;
  }

  private flowStep(spec: BackgroundJobSpec): FlowStep {
    return {
      name: spec.type,
      queueName: BACKGROUND_JOB_QUEUES[spec.type],
      data: spec.payload,
      opts: {
        ...this.jobOptions(spec.options ?? {}),
        jobId: this.jobId(spec.type, spec.dedupeKey),
      },
    };
  }
}
