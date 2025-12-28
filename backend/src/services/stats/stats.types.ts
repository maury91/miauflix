export interface MetricStats {
  count: number;
  min: number;
  max: number;
  avg: number;
}

export type ReportResult = {
  [name: string]: Array<MetricStats | number>;
};
