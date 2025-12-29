import type { Api } from './api.util';

/**
 * Decorator to track API request status using StatsService.
 * Updates queue, success/failure events, and request duration metrics.
 */
export function TrackStatus() {
  return function <This extends Api>(
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (this: This, ...args: unknown[]) {
      if (typeof this.requestQueueCount !== 'number') this.requestQueueCount = 0;
      this.requestQueueCount++;

      // Get API name from constructor name (e.g., "TMDBApi" -> "tmdb", "YTSApi" -> "yts", "TheRARBGApi" -> "therarbg")
      const apiName = this.constructor.name.replace(/Api$/, '').toLowerCase();

      const metricName = `api.${apiName}.request`;
      const successEventName = `api.${apiName}.request.success`;
      const failureEventName = `api.${apiName}.request.failure`;

      const metricId = this.statsService.metricStart(metricName);

      try {
        const result = await originalMethod.apply(this, args);
        this.lastRequest = Date.now();
        this.statsService.metricEnd(metricId);
        this.statsService.event(successEventName);
        return result;
      } catch (err) {
        this.lastRequest = Date.now();
        this.statsService.metricEnd(metricId);
        this.statsService.event(failureEventName);
        throw err;
      } finally {
        this.requestQueueCount = Math.max(0, this.requestQueueCount - 1);
      }
    };
    return descriptor;
  };
}
