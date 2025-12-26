import { performance } from 'perf_hooks';

import type { MetricStats, ReportResult } from './stats.types';

const SECONDS_PER_DAY = 24 * 60 * 60; // 86400

interface MetricStart {
  name: string;
  startTime: number;
  timeframeIndex: number;
}

export class StatsService {
  private readonly timeframeSize: number;
  private readonly maxTimeframes: number;
  private readonly metricStarts: Map<number, MetricStart>;
  private readonly metricData: Map<string, Map<number, number[]>>;
  private readonly eventData: Map<string, Map<number, number>>;
  private readonly oldestMidnightTimestamp = this.getStartOfDay();
  private nextMetricId = 1;

  constructor(timeframeSize: number = 300, maxTimeframes: number = 288) {
    // Validate that timeframeSize is a divisor of the number of seconds in a day
    if (SECONDS_PER_DAY % timeframeSize !== 0) {
      throw new Error(
        `timeframeSize (${timeframeSize}) must be a divisor of ${SECONDS_PER_DAY} (number of seconds in a day)`
      );
    }

    if (timeframeSize <= 0) {
      throw new Error('timeframeSize must be greater than 0');
    }

    if (maxTimeframes <= 0) {
      throw new Error('maxTimeframes must be greater than 0');
    }

    this.timeframeSize = timeframeSize;
    this.maxTimeframes = maxTimeframes;
    this.metricStarts = new Map();
    this.metricData = new Map();
    this.eventData = new Map();
  }

  /**
   * Calculate the start of the current day (midnight) in milliseconds
   */
  private getStartOfDay(): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return startOfDay.getTime();
  }

  /**
   * Calculate the absolute timeframe index (aligned to midnight boundaries, never resets)
   * This allows tracking data across multiple days
   */
  private getCurrentTimeframeIndex(): number {
    const now = Date.now();
    const startOfDay = this.getStartOfDay();
    const elapsedSeconds = Math.floor((now - startOfDay) / 1000);
    const timeframeInDay = Math.floor(elapsedSeconds / this.timeframeSize);

    // Calculate days since initialization (based on midnight boundaries)
    const timeframesPerDay = SECONDS_PER_DAY / this.timeframeSize;
    const daysSinceInitialization = Math.floor(
      (startOfDay - this.oldestMidnightTimestamp) / (1000 * SECONDS_PER_DAY)
    );

    // Absolute index = days since initialization * timeframes per day + timeframe within day
    return daysSinceInitialization * timeframesPerDay + timeframeInDay;
  }

  /**
   * Start measuring a metric
   * @param name The name of the metric
   * @returns A unique ID that can be passed to metricEnd
   */
  metricStart(name: string): number {
    this.nextMetricId = (this.nextMetricId % Number.MAX_SAFE_INTEGER) + 1;
    const id = this.nextMetricId;
    const currentTimeframeIndex = this.getCurrentTimeframeIndex();

    this.metricStarts.set(id, {
      name,
      startTime: performance.now(),
      timeframeIndex: currentTimeframeIndex,
    });

    return id;
  }

  /**
   * End measuring a metric
   * @param id The ID returned from metricStart
   */
  metricEnd(id: number): void {
    const metricStart = this.metricStarts.get(id);
    if (!metricStart) {
      // Invalid ID - silently ignore
      return;
    }

    const duration = performance.now() - metricStart.startTime;
    const durationSeconds = duration / 1000;

    // Get or create the metric data map for this name
    if (!this.metricData.has(metricStart.name)) {
      this.metricData.set(metricStart.name, new Map());
    }

    const metricTimeframes = this.metricData.get(metricStart.name)!;

    // Get or create the durations array for this timeframe
    if (!metricTimeframes.has(metricStart.timeframeIndex)) {
      metricTimeframes.set(metricStart.timeframeIndex, []);
    }

    metricTimeframes.get(metricStart.timeframeIndex)!.push(durationSeconds);

    // Clean up the start record
    this.metricStarts.delete(id);

    // Cleanup old timeframes
    this.cleanupOldTimeframes();
  }

  /**
   * Cancel measuring a metric (remove it without recording duration)
   * @param id The ID returned from metricStart
   */
  metricCancel(id: number): void {
    const metricStart = this.metricStarts.get(id);
    if (!metricStart) {
      // Invalid ID - silently ignore
      return;
    }

    // Simply remove the start record without recording any duration
    this.metricStarts.delete(id);
  }

  /**
   * Store an event
   * @param name The name of the event
   */
  event(name: string): void {
    const currentTimeframeIndex = this.getCurrentTimeframeIndex();

    // Get or create the event data map for this name
    if (!this.eventData.has(name)) {
      this.eventData.set(name, new Map());
    }

    const eventTimeframes = this.eventData.get(name)!;

    // Increment count for this timeframe
    const currentCount = eventTimeframes.get(currentTimeframeIndex) || 0;
    eventTimeframes.set(currentTimeframeIndex, currentCount + 1);

    // Cleanup old timeframes
    this.cleanupOldTimeframes();
  }

  /**
   * Calculate statistics for a metric's durations
   */
  private calculateMetricStats(durations: number[]): MetricStats {
    if (durations.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0 };
    }

    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const sum = durations.reduce((acc, val) => acc + val, 0);
    const avg = sum / durations.length;

    return {
      count: durations.length,
      min,
      max,
      avg,
    };
  }

  /**
   * Get report for the last N timeframes, or all available data if timeframes is not provided
   * @param timeframes Optional number of timeframes to include in the report. If omitted, returns all available data.
   * @returns Aggregated statistics grouped by timeframe
   */
  report(timeframes?: number): ReportResult {
    const currentTimeframeIndex = this.getCurrentTimeframeIndex();
    let startTimeframeIndex: number;
    const endTimeframeIndex = currentTimeframeIndex;

    if (timeframes !== undefined) {
      // Use provided timeframes
      startTimeframeIndex = Math.max(0, currentTimeframeIndex - timeframes + 1);
    } else {
      // Find minimum timeframe index across all data
      let minTimeframeIndex = currentTimeframeIndex;

      // Check metric data
      for (const metricTimeframes of this.metricData.values()) {
        for (const timeframeIndex of metricTimeframes.keys()) {
          minTimeframeIndex = Math.min(minTimeframeIndex, timeframeIndex);
        }
      }

      // Check event data
      for (const eventTimeframes of this.eventData.values()) {
        for (const timeframeIndex of eventTimeframes.keys()) {
          minTimeframeIndex = Math.min(minTimeframeIndex, timeframeIndex);
        }
      }

      // If no data exists, use current timeframe
      startTimeframeIndex =
        minTimeframeIndex === currentTimeframeIndex ? currentTimeframeIndex : minTimeframeIndex;
    }

    const result: ReportResult = {};

    // Process metrics
    for (const [metricName, metricTimeframes] of this.metricData.entries()) {
      const metricStats: MetricStats[] = [];

      for (let i = startTimeframeIndex; i <= endTimeframeIndex; i++) {
        const durations = metricTimeframes.get(i) || [];
        metricStats.push(this.calculateMetricStats(durations));
      }

      result[metricName] = metricStats;
    }

    // Process events
    for (const [eventName, eventTimeframes] of this.eventData.entries()) {
      const eventCounts: number[] = [];

      for (let i = startTimeframeIndex; i <= endTimeframeIndex; i++) {
        const count = eventTimeframes.get(i) || 0;
        eventCounts.push(count);
      }

      result[eventName] = eventCounts;
    }

    return result;
  }

  /**
   * Clean up old timeframes beyond maxTimeframes limit
   */
  private cleanupOldTimeframes(): void {
    const currentTimeframeIndex = this.getCurrentTimeframeIndex();
    const cutoffTimeframeIndex = currentTimeframeIndex - this.maxTimeframes;

    // Clean up metric data
    for (const metricTimeframes of this.metricData.values()) {
      for (const timeframeIndex of metricTimeframes.keys()) {
        if (timeframeIndex < cutoffTimeframeIndex) {
          metricTimeframes.delete(timeframeIndex);
        }
      }
    }

    // Clean up event data
    for (const eventTimeframes of this.eventData.values()) {
      for (const timeframeIndex of eventTimeframes.keys()) {
        if (timeframeIndex < cutoffTimeframeIndex) {
          eventTimeframes.delete(timeframeIndex);
        }
      }
    }

    // Clean up metric starts that are in old timeframes
    for (const [id, metricStart] of this.metricStarts.entries()) {
      if (metricStart.timeframeIndex < cutoffTimeframeIndex) {
        this.metricStarts.delete(id);
      }
    }
  }
}
