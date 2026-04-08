import { logger } from '@logger';
import { context, trace } from '@opentelemetry/api';
import { clearInterval, setTimeout } from 'timers';

import type { ScheduleTask } from '@mytypes/scheduler.types';
import { TracingUtil } from '@utils/tracing.util';

export class Scheduler {
  private tasks: Map<string, NodeJS.Timeout>;

  constructor() {
    this.tasks = new Map();
  }

  scheduleTask(taskName: string, interval: number, task: () => Promise<void> | void): void {
    if (this.tasks.has(taskName)) {
      throw new Error(`Task with name "${taskName}" is already scheduled.`);
    }

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
          const traceDir = process.env.TRACE_FILE || '/tmp';
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
        const emptyCtx = trace.deleteSpan(context.active());
        const intervalId = setTimeout(() => {
          context.with(emptyCtx, executeTask);
        }, interval * 1000);
        this.tasks.set(taskName, intervalId);
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
    const intervalId = this.tasks.get(taskName);
    if (!intervalId) {
      throw new Error(`Task with name "${taskName}" is not scheduled.`);
    }

    clearInterval(intervalId);
    this.tasks.delete(taskName);
  }

  listTasks(): string[] {
    return Array.from(this.tasks.keys());
  }
}
