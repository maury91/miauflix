import { logger } from '@logger';
import { context, trace } from '@opentelemetry/api';
import { setTimeout } from 'timers';

import { ENV } from '@constants';
import { SchedulerError } from '@errors/scheduler.errors';
import type { ScheduleTask } from '@mytypes/scheduler.types';
import { TracingUtil } from '@utils/tracing.util';

interface ScheduledTaskRecord {
  timerId: NodeJS.Timeout | null;
  cancelled: boolean;
}

export class Scheduler {
  private tasks: Map<string, ScheduledTaskRecord>;

  constructor() {
    this.tasks = new Map();
  }

  scheduleTask(taskName: string, interval: number, task: () => Promise<void> | void): void {
    if (this.tasks.has(taskName)) {
      throw new SchedulerError(
        `Task with name "${taskName}" is already scheduled.`,
        'already_scheduled'
      );
    }

    // Register before first run so cancelTask works immediately
    const record: ScheduledTaskRecord = { timerId: null, cancelled: false };
    this.tasks.set(taskName, record);

    const executeTask = async () => {
      try {
        logger.debug('Scheduler', `Executing task: ${taskName}`);

        // Create a new trace context for this task execution (like Hono does for HTTP requests)
        const taskSpan = TracingUtil.createTaskSpan(taskName, {
          'task.interval': interval,
          'task.execution_time': new Date().toISOString(),
        });

        if (taskSpan) {
          const traceId = taskSpan.spanContext().traceId;
          const traceDir = ENV('TRACE_FILE') || '/tmp';
          logger.debug(
            'Scheduler',
            `Trace ID for task '${taskName}': ${traceId} (trace file: ${traceDir}/${traceId}.log)`
          );
          await TracingUtil.executeInSpan(taskSpan, () => task());
        } else {
          await task();
        }

        logger.debug('Scheduler', `Task ${taskName} completed successfully`);
      } catch (err) {
        logger.error('Scheduler', `Task ${taskName} failed with error:`, err);
      } finally {
        // Only reschedule if the task has not been cancelled
        if (!record.cancelled) {
          const emptyCtx = trace.deleteSpan(context.active());
          record.timerId = setTimeout(() => {
            context.with(emptyCtx, executeTask);
          }, interval * 1000);
        }
      }
    };

    context.with(trace.deleteSpan(context.active()), executeTask);
  }

  scheduleTasks(tasks: ScheduleTask[]) {
    for (const task of tasks) {
      this.scheduleTask(task.name, task.interval, task.task);
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
