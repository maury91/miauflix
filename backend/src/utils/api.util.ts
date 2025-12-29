import type { Cache } from 'cache-manager';

import type { StatsService } from '@services/stats/stats.service';
import { RateLimiter } from '@utils/rateLimiter';

export abstract class Api {
  public requestQueueCount = 0;
  public lastRequest: number | null = null;

  protected readonly rateLimiter: RateLimiter;
  protected readonly highPriorityRateLimiter: RateLimiter;

  constructor(
    protected readonly cache: Cache,
    protected readonly statsService: StatsService,
    protected apiUrl: string,
    rateLimit: number,
    highPriorityRateLimit: number = rateLimit * 2 // Default to identical rate limit ( it's a secondary queue )
  ) {
    if (!cache) {
      throw new Error('Cache is required');
    }
    this.rateLimiter = new RateLimiter(rateLimit, `${this.constructor.name}:default`);
    this.highPriorityRateLimiter = new RateLimiter(
      highPriorityRateLimit,
      `${this.constructor.name}:highPriority`
    );
  }

  protected constructUrl(endpoint: string, params: Record<string, boolean | number | string> = {}) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      queryParams.append(key, String(value));
    });

    return `${this.apiUrl}/${endpoint}?${queryParams.toString()}`;
  }

  protected throttle(highPriority: boolean = false) {
    if (highPriority) {
      const defaultQWaitTime = this.rateLimiter.getDelay();
      const highPriorityQWaitTime = this.highPriorityRateLimiter.getDelay();
      if (highPriorityQWaitTime < defaultQWaitTime) {
        return this.highPriorityRateLimiter.throttle();
      }
    }
    return this.rateLimiter.throttle();
  }
}
