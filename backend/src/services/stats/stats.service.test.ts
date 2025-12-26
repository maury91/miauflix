import { StatsService } from './stats.service';
import type { MetricStats } from './stats.types';

// Mock performance.now() to work with fake timers
jest.mock('perf_hooks', () => {
  let mockPerfNow = 0;
  return {
    performance: {
      now: jest.fn(() => mockPerfNow),
    },
    __setPerfNow: (value: number) => {
      mockPerfNow = value;
    },
    __advancePerfNow: (ms: number) => {
      mockPerfNow += ms;
    },
  };
});

const { __setPerfNow: setPerfNow, __advancePerfNow: advancePerfNow } =
  jest.requireMock('perf_hooks');

describe('StatsService', () => {
  const SECONDS_PER_DAY = 24 * 60 * 60; // 86400

  beforeEach(() => {
    jest.useFakeTimers();
    setPerfNow(0);
    // Set time to a specific date (midnight of a known day)
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create service with default parameters', () => {
      expect(new StatsService()).toBeDefined();
    });

    it('should create service with custom timeframeSize', () => {
      expect(new StatsService(600)).toBeDefined();
    });

    it('should create service with custom maxTimeframes', () => {
      expect(new StatsService(300, 144)).toBeDefined();
    });

    it('should throw error if timeframeSize is 0', () => {
      // The service checks divisor first, so 0 triggers the divisor error
      expect(() => new StatsService(0)).toThrow(
        'timeframeSize (0) must be a divisor of 86400 (number of seconds in a day)'
      );
    });

    it('should throw error if timeframeSize is not a divisor of 86400', () => {
      // 100 is actually a divisor (86400 / 100 = 864), so use 7 which is not
      expect(() => new StatsService(7)).toThrow(
        'timeframeSize (7) must be a divisor of 86400 (number of seconds in a day)'
      );
    });

    it('should throw error if timeframeSize is negative', () => {
      expect(() => new StatsService(-100)).toThrow('timeframeSize must be greater than 0');
    });

    it('should throw error if maxTimeframes is 0', () => {
      expect(() => new StatsService(300, 0)).toThrow('maxTimeframes must be greater than 0');
    });

    it('should throw error if maxTimeframes is negative', () => {
      expect(() => new StatsService(300, -10)).toThrow('maxTimeframes must be greater than 0');
    });

    it('should accept valid divisors of 86400', () => {
      // Test various valid divisors
      expect(() => new StatsService(1)).not.toThrow();
      expect(() => new StatsService(60)).not.toThrow(); // 1 minute
      expect(() => new StatsService(300)).not.toThrow(); // 5 minutes
      expect(() => new StatsService(600)).not.toThrow(); // 10 minutes
      expect(() => new StatsService(3600)).not.toThrow(); // 1 hour
      expect(() => new StatsService(86400)).not.toThrow(); // 1 day
    });
  });

  describe('metricStart', () => {
    it('should return a unique ID', () => {
      const service = new StatsService(300); // 5 minute timeframes
      const id1 = service.metricStart('test-metric');
      const id2 = service.metricStart('test-metric');
      const id3 = service.metricStart('test-metric');
      expect(id1).toBeGreaterThan(0);
      expect(id2).not.toEqual(id1);
      expect(id3).not.toEqual(id2);
      expect(id3).not.toEqual(id1);
    });

    it('should handle multiple metrics with same name', () => {
      const service = new StatsService(300); // 5 minute timeframes
      const id1 = service.metricStart('metric-a');
      const id2 = service.metricStart('metric-a');
      expect(id1).not.toBe(id2);
    });

    it('should handle ID overflow', () => {
      const service = new StatsService(300); // 5 minute timeframes
      // Simulate ID near max safe integer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).nextMetricId = Number.MAX_SAFE_INTEGER - 1;
      const id1 = service.metricStart('test');
      const id2 = service.metricStart('test');
      expect(id2).toBeLessThan(id1); // Should wrap around
    });
  });

  describe('metricEnd', () => {
    it('should calculate and store metric duration', () => {
      const service = new StatsService(300);
      setPerfNow(0);
      const id = service.metricStart('test-metric');
      advancePerfNow(1500); // 1.5 seconds
      service.metricEnd(id);

      const report = service.report(1);
      expect(report['test-metric']).toBeDefined();
      const stats = report['test-metric'][0] as MetricStats;
      expect(stats.count).toBe(1);
      expect(stats.min).toBeCloseTo(1.5, 1);
      expect(stats.max).toBeCloseTo(1.5, 1);
      expect(stats.avg).toBeCloseTo(1.5, 1);
    });

    it('should store multiple metrics in same timeframe', () => {
      const service = new StatsService(300);
      setPerfNow(0);
      const id1 = service.metricStart('test-metric');
      advancePerfNow(500);
      service.metricEnd(id1);

      const id2 = service.metricStart('test-metric');
      advancePerfNow(1000);
      service.metricEnd(id2);

      const report = service.report(1);
      const stats = report['test-metric'][0] as MetricStats;
      expect(stats.count).toBe(2);
      expect(stats.min).toBeCloseTo(0.5, 1);
      expect(stats.max).toBeCloseTo(1.0, 1);
      expect(stats.avg).toBeCloseTo(0.75, 1);
    });

    it('should handle concurrent metrics', () => {
      const service = new StatsService(300);
      setPerfNow(0);
      const id1 = service.metricStart('test-metric');
      const id2 = service.metricStart('test-metric');
      advancePerfNow(500);
      service.metricEnd(id1);

      advancePerfNow(1000);
      service.metricEnd(id2);

      const report = service.report(1);
      const stats = report['test-metric'][0] as MetricStats;
      expect(stats.count).toBe(2);
      expect(stats.min).toBeCloseTo(0.5, 1);
      expect(stats.max).toBeCloseTo(1.5, 1);
      expect(stats.avg).toBeCloseTo(1.0, 1);
    });

    it('should silently ignore invalid metric ID', () => {
      const service = new StatsService(300);
      expect(() => service.metricEnd(99999)).not.toThrow();
      const report = service.report(1);
      expect(report).toEqual({});
    });

    it('should store metrics in correct timeframe', () => {
      const service = new StatsService(300);
      // Start at beginning of first timeframe
      setPerfNow(0);
      const id1 = service.metricStart('test-metric');
      advancePerfNow(100);
      service.metricEnd(id1);

      // Move to second timeframe (5 minutes = 300 seconds)
      jest.advanceTimersByTime(300 * 1000);
      advancePerfNow(300 * 1000);
      const id2 = service.metricStart('test-metric');
      advancePerfNow(200);
      service.metricEnd(id2);

      const report = service.report(2);
      const stats = report['test-metric'] as MetricStats[];
      expect(stats.length).toBe(2);
      expect(stats[0].count).toBe(1); // First timeframe
      expect(stats[1].count).toBe(1); // Second timeframe
    });
  });

  describe('event', () => {
    it('should track event count', () => {
      const service = new StatsService(300);
      service.event('test-event');
      const report = service.report(1);
      expect(report['test-event']).toEqual([1]);
    });

    it('should increment event count in same timeframe', () => {
      const service = new StatsService(300);
      service.event('test-event');
      service.event('test-event');
      service.event('test-event');
      const report = service.report(1);
      expect(report['test-event']).toEqual([3]);
    });

    it('should track events in different timeframes', () => {
      const service = new StatsService(300);
      service.event('test-event');
      // Move to next timeframe
      jest.advanceTimersByTime(300 * 1000);
      service.event('test-event');
      service.event('test-event');

      const report = service.report(2);
      expect(report['test-event']).toEqual([1, 2]);
    });

    it('should track multiple different events', () => {
      const service = new StatsService(300);
      service.event('event-a');
      service.event('event-b');
      service.event('event-a');

      const report = service.report(1);
      expect(report['event-a']).toEqual([2]);
      expect(report['event-b']).toEqual([1]);
    });
  });

  describe('report', () => {
    it('should return empty report when no data', () => {
      const service = new StatsService(300); // 5 minute timeframes
      const report = service.report(1);
      expect(report).toEqual({});
    });

    it('should return report for single timeframe', () => {
      const service = new StatsService(300); // 5 minute timeframes
      setPerfNow(0);
      const id = service.metricStart('metric-a');
      advancePerfNow(1000);
      service.metricEnd(id);
      service.event('event-a');

      const report = service.report(1);
      expect(report['metric-a']).toBeDefined();
      expect(report['event-a']).toEqual([1]);
    });

    it('should return report for multiple timeframes', () => {
      const service = new StatsService(300); // 5 minute timeframes
      // First timeframe
      setPerfNow(0);
      service.event('test-event');
      const id1 = service.metricStart('test-metric');
      advancePerfNow(500);
      service.metricEnd(id1);

      // Second timeframe
      jest.advanceTimersByTime(300 * 1000);
      advancePerfNow(300 * 1000);
      service.event('test-event');
      service.event('test-event');

      // Third timeframe
      jest.advanceTimersByTime(300 * 1000);
      advancePerfNow(300 * 1000);
      const id2 = service.metricStart('test-metric');
      advancePerfNow(1000);
      service.metricEnd(id2);

      const report = service.report(3);
      expect(report['test-event']).toEqual([1, 2, 0]);
      const stats = report['test-metric'] as MetricStats[];
      expect(stats.length).toBe(3);
      expect(stats[0].count).toBe(1);
      expect(stats[1].count).toBe(0);
      expect(stats[2].count).toBe(1);
    });

    it('should return zero values for empty timeframes', () => {
      const service = new StatsService(300); // 5 minute timeframes
      // Create data in first timeframe
      service.event('test-event');
      // Move to third timeframe
      jest.advanceTimersByTime(600 * 1000);
      advancePerfNow(600 * 1000);
      service.event('test-event');

      const report = service.report(3);
      expect(report['test-event']).toEqual([1, 0, 1]);
    });

    it('should calculate correct statistics for metrics', () => {
      const service = new StatsService(300); // 5 minute timeframes
      setPerfNow(0);
      const durations = [0.5, 1.0, 1.5, 2.0, 2.5];
      for (const duration of durations) {
        const id = service.metricStart('test-metric');
        advancePerfNow(duration * 1000);
        service.metricEnd(id);
      }

      const report = service.report(1);
      const stats = report['test-metric'][0] as MetricStats;
      expect(stats.count).toBe(5);
      expect(stats.min).toBeCloseTo(0.5, 1);
      expect(stats.max).toBeCloseTo(2.5, 1);
      expect(stats.avg).toBeCloseTo(1.5, 1);
    });

    it('should handle report with more timeframes than available data', () => {
      const service = new StatsService(300); // 5 minute timeframes
      service.event('test-event');
      // Move to a later timeframe (5 timeframes forward)
      jest.advanceTimersByTime(5 * 300 * 1000);
      const report = service.report(10);
      // We're now in timeframe 5, so report(10) gives us timeframes [5-10+1, 5] = [-4, 5] = [0, 5] = 6 timeframes
      // But Math.max(0, ...) makes it [0, 5], so we get 6 timeframes
      expect(report['test-event'].length).toBe(6);
      // Event was in timeframe 0, which is at index 0 in the report
      expect(report['test-event'][0]).toBe(1);
    });
  });

  describe('multi-day tracking', () => {
    it('should track data across multiple days', () => {
      // Use large maxTimeframes to avoid cleanup during test
      const service = new StatsService(300, 1000); // 5 minute timeframes, large max
      // Day 1 - first timeframe (timeframe 0)
      setPerfNow(0);
      service.event('daily-event');

      // Move to next day (24 hours = 1 day)
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      advancePerfNow(24 * 60 * 60 * 1000);
      service.event('daily-event');

      // Move to day 3
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      advancePerfNow(24 * 60 * 60 * 1000);
      service.event('daily-event');

      // Report should include all days
      const timeframesPerDay = SECONDS_PER_DAY / 300; // 288 timeframes per day
      // We're now in day 3, timeframe 0 of day 3
      // Absolute index = 2 * 288 + 0 = 576
      // Report from (576 - 3*288 + 1) to 576 = (-288 + 1) to 576 = 0 to 576
      // So we get 577 timeframes (0 to 576 inclusive)
      const report = service.report(timeframesPerDay * 3);
      const events = report['daily-event'];
      // Should have events in first timeframe of each day
      // Day 1: timeframe 0 (absolute index 0)
      // Day 2: timeframe 0 (absolute index 288)
      // Day 3: timeframe 0 (absolute index 576)
      expect(events.length).toBe(577); // 0 to 576 inclusive = 577 timeframes
      expect(events[0]).toBe(1); // Day 1, first timeframe
      expect(events[timeframesPerDay]).toBe(1); // Day 2, first timeframe
      expect(events[timeframesPerDay * 2]).toBe(1); // Day 3, first timeframe
    });

    it('should maintain correct timeframe indices across days', () => {
      // Use large maxTimeframes to avoid cleanup during test
      const service = new StatsService(300, 1000); // 5 minute timeframes, large max
      setPerfNow(0);
      const id1 = service.metricStart('test-metric');
      advancePerfNow(1000);
      service.metricEnd(id1);

      // Move to next day
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      advancePerfNow(24 * 60 * 60 * 1000);
      const id2 = service.metricStart('test-metric');
      advancePerfNow(2000);
      service.metricEnd(id2);

      const timeframesPerDay = SECONDS_PER_DAY / 300;
      const report = service.report(timeframesPerDay * 2);
      const stats = report['test-metric'] as MetricStats[];
      expect(stats[0].count).toBe(1); // First day
      expect(stats[timeframesPerDay].count).toBe(1); // Second day
    });
  });

  describe('cleanup', () => {
    it('should cleanup old timeframes beyond maxTimeframes', () => {
      const service = new StatsService(300, 10); // 5 minute timeframes, max 10 timeframes
      // Create data in first timeframe
      setPerfNow(0);
      service.event('test-event');

      // Create data in 15th timeframe (beyond max of 10)
      jest.advanceTimersByTime(15 * 300 * 1000);
      advancePerfNow(15 * 300 * 1000);
      service.event('test-event');

      // Report should only show recent timeframes
      const report = service.report(10);
      expect(report['test-event'].length).toBe(10);
      // First event should be gone (cleaned up)
      expect(report['test-event'][0]).toBe(0);
      // Last event should be present
      expect(report['test-event'][9]).toBe(1);
    });

    it('should cleanup old metric data', () => {
      const service = new StatsService(300, 10); // 5 minute timeframes, max 10 timeframes
      setPerfNow(0);
      const id1 = service.metricStart('test-metric');
      advancePerfNow(1000);
      service.metricEnd(id1);

      // Move beyond maxTimeframes
      jest.advanceTimersByTime(15 * 300 * 1000);
      advancePerfNow(15 * 300 * 1000);
      const id2 = service.metricStart('test-metric');
      advancePerfNow(2000);
      service.metricEnd(id2);

      const report = service.report(10);
      const stats = report['test-metric'] as MetricStats[];
      expect(stats[0].count).toBe(0); // Old data cleaned up
      expect(stats[9].count).toBe(1); // New data present
    });

    it('should cleanup metric starts in old timeframes', () => {
      const service = new StatsService(300, 10); // 5 minute timeframes, max 10 timeframes
      setPerfNow(0);
      const id = service.metricStart('test-metric');
      // Don't end it yet

      // Move beyond maxTimeframes (trigger cleanup by adding an event)
      jest.advanceTimersByTime(15 * 300 * 1000);
      advancePerfNow(15 * 300 * 1000);
      service.event('trigger-cleanup'); // This triggers cleanup

      // Try to end - should be cleaned up, so nothing happens
      service.metricEnd(id);

      const report = service.report(10);
      // Metric should not appear since it was never properly ended
      expect(report['test-metric']).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle metrics with zero duration', () => {
      const service = new StatsService(300);
      setPerfNow(0);
      const id = service.metricStart('test-metric');
      // End immediately (no time advance)
      service.metricEnd(id);

      const report = service.report(1);
      const stats = report['test-metric'][0] as MetricStats;
      expect(stats.count).toBe(1);
      expect(stats.min).toBeCloseTo(0, 2);
      expect(stats.max).toBeCloseTo(0, 2);
      expect(stats.avg).toBeCloseTo(0, 2);
    });

    it('should handle very long durations', () => {
      const service = new StatsService(300);
      setPerfNow(0);
      const id = service.metricStart('test-metric');
      advancePerfNow(3600 * 1000); // 1 hour
      service.metricEnd(id);

      const report = service.report(1);
      const stats = report['test-metric'][0] as MetricStats;
      expect(stats.min).toBeCloseTo(3600, 1);
      expect(stats.max).toBeCloseTo(3600, 1);
    });

    it('should handle report with zero timeframes', () => {
      const service = new StatsService(300);
      service.event('test-event');
      const report = service.report(0);
      // When timeframes is 0, startTimeframeIndex = currentIndex + 1 > endTimeframeIndex
      // So the loop doesn't execute, but we still iterate over existing data keys
      // The result will have the key but with empty arrays
      if (Object.keys(report).length > 0) {
        // If there's data, it should have empty arrays
        expect(report['test-event']).toEqual([]);
      } else {
        // Or it could be empty if no data was processed
        expect(report).toEqual({});
      }
    });

    it('should handle multiple metrics ending in different timeframes', () => {
      const service = new StatsService(300);
      setPerfNow(0);
      const id1 = service.metricStart('metric-a');
      const id2 = service.metricStart('metric-b');

      // End first in first timeframe
      advancePerfNow(500);
      service.metricEnd(id1);

      // Move to next timeframe and end second
      jest.advanceTimersByTime(300 * 1000);
      advancePerfNow(300 * 1000);
      service.metricEnd(id2);

      const report = service.report(2);
      const statsA = report['metric-a'] as MetricStats[];
      const statsB = report['metric-b'] as MetricStats[];
      // Both metrics started in timeframe 0, so both are stored in timeframe 0
      // (metrics are stored in the timeframe where they started, not where they ended)
      expect(statsA[0].count).toBe(1);
      expect(statsA[1].count).toBe(0);
      expect(statsB[0].count).toBe(1); // Stored in timeframe 0 where it started
      expect(statsB[1].count).toBe(0);
    });
  });
});
