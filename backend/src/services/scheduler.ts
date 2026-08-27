import { logger } from '@logger';
import { context, trace } from '@opentelemetry/api';
import { setTimeout } from 'timers';

import { SchedulerError } from '@errors/scheduler.errors';
import type { ConfigService } from '@mytypes/configuration';
import type { ScheduleTask } from '@mytypes/scheduler.types';
import { TracingUtil } from '@utils/tracing.util';

interface ScheduledTaskRecord {
  timerId: NodeJS.Timeout | null;
  cancelled: boolean;
  dependencies: Set<string>;
  execute: () => Promise<void>;
  running: boolean;
  runAgain: boolean;
}

export class Scheduler {
  private tasks: Map<string, ScheduledTaskRecord>;
  private readonly traceDir: string;

  constructor(config: ConfigService) {
    this.tasks = new Map();
    this.traceDir = config.getOrThrow('TRACE_DIR');
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
      try {
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
    context.with(trace.deleteSpan(context.active()), executeTask);
  }

  scheduleTasks(tasks: ScheduleTask[]) {
    for (const task of tasks) {
      this.scheduleTask(task.name, task.interval, task.task, task.dependencies);
    }
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
