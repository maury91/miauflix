import type { Cache } from 'cache-manager';

import { RateLimiter } from '@utils/rateLimiter';
import { groupTimestampsByInterval } from '@utils/trackStatus.util';

export abstract class Api {
  public requestQueueCount = 0;
  public requestSuccesses: number[] = [];
  public requestFailures: number[] = [];
  public lastRequest: number | null = null;

  protected readonly rateLimiter: RateLimiter;
  protected readonly highPriorityRateLimiter: RateLimiter;

  constructor(
    protected cache: Cache,
    protected apiUrl: string,
    rateLimit: number,
    highPriorityRateLimit: number = rateLimit * 2 // Default to identical rate limit ( it's a secondary queue )
  ) {
    if (!cache) {
      throw new Error('Cache is required');
    }
    this.rateLimiter = new RateLimiter(rateLimit);
    this.highPriorityRateLimiter = new RateLimiter(highPriorityRateLimit);
  }

  protected constructUrl(endpoint: string, params: Record<string, boolean | number | string> = {}) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      queryParams.append(key, String(value));
    });

    return `${this.apiUrl}/${endpoint}?${queryParams.toString()}`;
  }

  protected throttle(highPriority: boolean = false) {
    return highPriority ? this.highPriorityRateLimiter.throttle() : this.rateLimiter.throttle();
  }

  /**
   * Returns the current status of the API instance.
   * - queue: number of requests in the queue
   * - successes: array of { time, count } for last 24h, grouped by 5 min
   * - failures: array of { time, count } for last 24h, grouped by 5 min
   * - lastRequest: timestamp of last request (ms since epoch)
   */
  public status() {
    return {
      queue: this.requestQueueCount,
      successes: groupTimestampsByInterval(this.requestSuccesses).map(item => ({
        ...item,
        time: new Date(item.time).toISOString(),
      })),
      failures: groupTimestampsByInterval(this.requestFailures).map(item => ({
        ...item,
        time: new Date(item.time).toISOString(),
      })),
      lastRequest: this.lastRequest ? new Date(this.lastRequest).toISOString() : null,
    };
  }
}
