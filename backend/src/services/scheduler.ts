import { logger } from '@logger';
import { context, trace } from '@opentelemetry/api';

import { SchedulerError } from '@errors/scheduler.errors';
import type { ConfigService } from '@mytypes/configuration';
import type { ScheduleTask } from '@mytypes/scheduler.types';
import { TracingUtil } from '@utils/tracing.util';

interface ScheduledTaskRecord {
  timerId: NodeJS.Timeout | null;
  cancelled: boolean;
  dependencies: Set<string>;
  execute: () => Promise<void>;
  hasStarted: boolean;
  running: boolean;
  runAgain: boolean;
}

export class Scheduler {
  private static readonly INITIAL_TASK_SPACING_MS = 3_000;
  private static readonly FINAL_STARTUP_MEMORY_DELAY_MS = 5_000;

  private tasks: Map<string, ScheduledTaskRecord>;
  private readonly traceDir: string;
  private readonly memoryDiagnosticsEnabled: boolean;
  private finalStartupMemoryTimer: NodeJS.Timeout | null = null;
  private initialTaskQueue: Promise<void> = Promise.resolve();
  private initialTaskVersion = 0;

  constructor(config: ConfigService) {
    this.tasks = new Map();
    this.traceDir = config.getOrThrow('TRACE_DIR');
    this.memoryDiagnosticsEnabled = config.getOrThrow('SCHEDULER_MEMORY_DIAGNOSTICS');
  }

  scheduleTask(
    taskName: string,
    interval: number,
    task: () => Promise<void> | void,
    dependencies: string[] = []
  ): void {
    if (this.tasks.has(taskName)) {
      throw new SchedulerError(
        `Task with name "${taskName}" is already scheduled.`,
        'already_scheduled'
      );
    }

    // Register before first run so cancelTask works immediately
    const record: ScheduledTaskRecord = {
      timerId: null,
      cancelled: false,
      dependencies: new Set(dependencies),
      execute: async () => {},
      hasStarted: false,
      running: false,
      runAgain: false,
    };
    this.tasks.set(taskName, record);

    const executeTask = async () => {
      if (record.running) {
        record.runAgain = true;
        return;
      }

      record.running = true;
      const startedAt = Date.now();
      try {
        if (!record.hasStarted) {
          record.hasStarted = true;
          this.logStartupMemory('before_initial_task', taskName);
          logger.info('Scheduler', `Starting initial task: ${taskName}`);
        }
        logger.debug('Scheduler', `Executing task: ${taskName}`);

        // Create a new trace context for this task execution (like Hono does for HTTP requests)
        const taskSpan = TracingUtil.createTaskSpan(taskName, {
          'task.interval': interval,
          'task.execution_time': new Date().toISOString(),
        });

        if (taskSpan) {
          const traceId = taskSpan.spanContext().traceId;
          logger.debug(
            'Scheduler',
            `Trace ID for task '${taskName}': ${traceId} (trace file: ${this.traceDir}/${traceId}.log)`
          );
          await TracingUtil.executeInSpan(taskSpan, () => task());
        } else {
          await task();
        }

        logger.debug('Scheduler', `Task ${taskName} completed successfully`);
        if (this.memoryDiagnosticsEnabled) {
          const memory = process.memoryUsage();
          logger.info(
            'SchedulerMemory',
            JSON.stringify({
              taskName,
              durationMs: Date.now() - startedAt,
              heapUsedMiB: Math.round(memory.heapUsed / 1024 / 1024),
              rssMiB: Math.round(memory.rss / 1024 / 1024),
            })
          );
        }
      } catch (err) {
        logger.error('Scheduler', `Task ${taskName} failed with error:`, err);
      } finally {
        record.running = false;
        if (record.cancelled) return;

        if (record.runAgain) {
          record.runAgain = false;
          const emptyCtx = trace.deleteSpan(context.active());
          record.timerId = setTimeout(() => context.with(emptyCtx, executeTask), 0);
        } else {
          const emptyCtx = trace.deleteSpan(context.active());
          record.timerId = setTimeout(() => {
            context.with(emptyCtx, executeTask);
          }, interval * 1000);
        }
      }
    };

    record.execute = executeTask;
    const initialTaskVersion = ++this.initialTaskVersion;
    const runInitialTask = async () => {
      if (record.cancelled) return;

      // Initial tasks can allocate heavily. Do not use independent timers here:
      // an event-loop stall lets all expired timers run together, recreating the
      // startup memory burst this queue is intended to prevent.
      if (initialTaskVersion > 1) {
        await new Promise<void>(resolve => {
          setTimeout(resolve, Scheduler.INITIAL_TASK_SPACING_MS);
        });
      }
      if (record.cancelled) return;

      if (initialTaskVersion === this.initialTaskVersion) {
        this.scheduleFinalStartupMemoryLog(Date.now());
      }
      await executeTask();
    };
    const queuedInitialTask =
      initialTaskVersion === 1 ? runInitialTask() : this.initialTaskQueue.then(runInitialTask);
    this.initialTaskQueue = queuedInitialTask.catch(error => {
      logger.error('Scheduler', `Unable to start initial task ${taskName}:`, error);
    });
  }

  scheduleTasks(tasks: ScheduleTask[]) {
    for (const task of tasks) {
      this.scheduleTask(task.name, task.interval, task.task, task.dependencies);
    }
  }

  private logStartupMemory(event: string, taskName?: string): void {
    const memory = process.memoryUsage();
    logger.info(
      'SchedulerMemory',
      JSON.stringify({
        event,
        taskName,
        heapUsedMiB: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMiB: Math.round(memory.heapTotal / 1024 / 1024),
        rssMiB: Math.round(memory.rss / 1024 / 1024),
      })
    );
  }

  private scheduleFinalStartupMemoryLog(lastInitialTaskStartAt: number): void {
    if (this.finalStartupMemoryTimer) {
      clearTimeout(this.finalStartupMemoryTimer);
    }
    const delay = Math.max(
      0,
      lastInitialTaskStartAt + Scheduler.FINAL_STARTUP_MEMORY_DELAY_MS - Date.now()
    );
    this.finalStartupMemoryTimer = setTimeout(() => {
      this.logStartupMemory('five_seconds_after_final_initial_task');
      this.finalStartupMemoryTimer = null;
    }, delay);
  }

  runTaskNow(taskName: string): void {
    const record = this.tasks.get(taskName);
    if (!record) {
      throw new SchedulerError(`Task with name "${taskName}" is not scheduled.`, 'not_scheduled');
    }

    if (record.timerId) {
      clearTimeout(record.timerId);
      record.timerId = null;
    }
    void record.execute();
  }

  notifyServicesRecovered(recoveries: Iterable<{ service: string; previousStatus: string }>): void {
    for (const recovery of recoveries) {
      const taskNames = [...this.tasks]
        .filter(([, record]) => record.dependencies.has(recovery.service))
        .map(([taskName]) => taskName);

      logger.info(
        'Scheduler',
        taskNames.length > 0
          ? `${recovery.service} recovered (${recovery.previousStatus} → ready); triggering dependent tasks: ${taskNames.join(', ')}`
          : `${recovery.service} recovered (${recovery.previousStatus} → ready); no dependent tasks to trigger`
      );

      for (const taskName of taskNames) {
        this.runTaskNow(taskName);
      }
    }
  }

  cancelTask(taskName: string): void {
    const record = this.tasks.get(taskName);
    if (!record) {
      throw new SchedulerError(`Task with name "${taskName}" is not scheduled.`, 'not_scheduled');
    }

    record.cancelled = true;
    if (record.timerId) {
      clearTimeout(record.timerId);
      record.timerId = null;
    }
    this.tasks.delete(taskName);
  }

  listTasks(): string[] {
    return Array.from(this.tasks.keys());
  }
}
