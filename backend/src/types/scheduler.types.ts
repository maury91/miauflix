export interface ScheduleTask {
  name: string;
  interval: number;
  task: () => Promise<void> | void;
}
