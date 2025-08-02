import { logger } from '@logger';
import { clearInterval, setTimeout } from 'timers';

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
          await TracingUtil.executeInSpan(taskSpan, () => task());
        } else {
          await task();
        }

        logger.debug('Scheduler', `Task ${taskName} completed successfully`);
      } catch (err) {
        logger.error('Scheduler', `Task ${taskName} failed with error:`, err);
      } finally {
        const intervalId = setTimeout(executeTask, interval * 1000);
        this.tasks.set(taskName, intervalId);
      }
    };

    executeTask();
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
