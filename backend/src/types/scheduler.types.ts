export interface ScheduleTask {
  name: string;
  interval: number;
  task: () => Promise<void> | void;
  /** Services that must be ready for this task. Recovering one triggers an immediate run. */
  dependencies?: string[];
}
