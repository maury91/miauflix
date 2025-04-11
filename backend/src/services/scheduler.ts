import { setTimeout, clearInterval } from "timers";

export class Scheduler {
  private tasks: Map<string, Timer>;

  constructor() {
    this.tasks = new Map();
  }

  scheduleTask(
    taskName: string,
    interval: number,
    task: () => void | Promise<void>,
  ): void {
    if (this.tasks.has(taskName)) {
      throw new Error(`Task with name "${taskName}" is already scheduled.`);
    }

    const executeTask = async () => {
      try {
        console.log(
          `Executing task: ${taskName} [${new Date().toISOString()}]`,
        );
        await task();
      } catch (err) {
        console.error(`Task ${taskName} failed with error:`, err);
      } finally {
        if (this.tasks.has(taskName)) {
          const intervalId = setTimeout(executeTask, interval * 1000);
          this.tasks.set(taskName, intervalId);
        }
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
