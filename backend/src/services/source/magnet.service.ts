import { logger } from '@logger';
import WebTorrent from 'webtorrent';

import { DynamicRateLimit } from '@utils/dynamic-rate-limit';

import type { TorrentCacheService, TorrentRetrievalService } from './types';

interface ServicePerformance {
  successRate: number;
  avgResponseTime: number;
  totalCalls: number;
  successfulCalls: number;
  failures: number;
  consecutiveFailures: number;
  lastUsed: number;
}

/**
 * Service for getting torrent files from magnet links ( or hash )
 * Uses both WebTorrent and torrent cache services with adaptive optimization
 */
export class MagnetService {
  private readonly timeout = 30000;
  private readonly client: WebTorrent.Instance;

  // Rate limiters for each service (WebTorrent has no limiter)
  private readonly rateLimiters: Record<TorrentCacheService, DynamicRateLimit>;

  // Performance tracking for service selection
  private readonly servicePerformance: Record<TorrentRetrievalService, ServicePerformance> = {
    webTorrent: this.createDefaultServicePerformance(),
    itorrents: this.createDefaultServicePerformance(),
    torCache: this.createDefaultServicePerformance(),
    btCache: this.createDefaultServicePerformance(),
  };

  constructor() {
    this.client = new WebTorrent();

    // Initialize rate limiters for each service
    this.rateLimiters = {
      itorrents: new DynamicRateLimit({ windowSize: 60000, limit: 120 }), // Allow 120 req/min
      torCache: new DynamicRateLimit({ windowSize: 60000, limit: 120 }), // Allow 120 req/min
      btCache: new DynamicRateLimit({ windowSize: 60000, limit: 120 }), // Allow 120 req/min
    };
  }

  /**
   */
  private createDefaultServicePerformance(): ServicePerformance {
    return {
      successRate: 0,
      avgResponseTime: 0,
      totalCalls: 0,
      successfulCalls: 0,
      failures: 0,
      consecutiveFailures: 0,
      lastUsed: 0,
    };
  }

  /**
   * Get a torrent file from a magnet link and hash
   * @param magnetLink The magnet link to convert
   * @param hash The hash of the magnet link
   * @returns The torrent file as a Buffer, or null if conversion failed
   */
  public async getTorrent(magnetLink: string, hash: string): Promise<Buffer | null> {
    logger.info('MagnetService', `Converting magnet link with hash: ${hash}`);

    const serviceOrder = this.getOptimizedServiceOrder();

    // Try services in optimized order
    for (const serviceName of serviceOrder) {
      try {
        const start = Date.now();

        const torrent =
          serviceName === 'webTorrent'
            ? await this.convertWithWebTorrent(magnetLink)
            : await this.covertWithTorrentCache(serviceName, hash);

        if (torrent === false) {
          // If we got a false, it means we were throttled
          logger.debug('MagnetService', `Throttling ${serviceName} for rate limiting`);
          continue;
        }

        this.updateServiceMetrics(serviceName, !!torrent, start, Date.now());
        if (torrent) {
          logger.info(
            'MagnetService',
            `Successfully converted magnet to torrent using ${serviceName} in ${Date.now() - start}ms`
          );
          return torrent;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn('MagnetService', `Error using ${serviceName}: ${errorMessage}`);

        this.updateServiceMetrics(serviceName, false, Date.now());
      }
    }

    logger.warn('MagnetService', `Could not convert magnet to torrent for hash: ${hash}`);
    return null;
  }

  /**
   * Convert a magnet link to torrent using a torrent cache service
   * @param serviceName The torrent cache service to use (itorrents, torCache, btCache)
   * @param hash The hash of the magnet link
   * @returns The torrent file as a Buffer, or false if rate limited
   */
  private async covertWithTorrentCache(
    serviceName: TorrentCacheService,
    hash: string
  ): Promise<Buffer | false | null> {
    const rateLimiter = this.rateLimiters[serviceName];

    // Check if we need to throttle requests (skip for null rate limiters like WebTorrent)
    const throttleMs = rateLimiter.getThrottle();
    if (throttleMs > 0) {
      return false;
    }

    const response = await this.fetch(this.getUrl(serviceName, hash));

    if (response) {
      const wasRateLimited = rateLimiter.reportResponse(response);
      if (wasRateLimited) {
        logger.warn(
          'MagnetService',
          `Rate limit detected for ${serviceName}, will adapt rate limiting`
        );
      }
    }

    if (response?.ok) {
      return Buffer.from(await response.arrayBuffer());
    }

    return null;
  }

  /**
   * Convert a magnet link to torrent using WebTorrent
   */
  private convertWithWebTorrent(magnetLink: string): Promise<Buffer | null> {
    return new Promise((resolve, reject) => {
      const now = Date.now();
      // Set timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        this.client.remove(magnetLink);
        reject(new Error('WebTorrent timeout'));
      }, this.timeout);

      logger.debug(
        'MagnetService',
        `Adding magnet to WebTorrent client: ${magnetLink.substring(0, 50)}...`
      );

      try {
        this.client.add(magnetLink, { announce: [] }, torrent => {
          clearTimeout(timeoutId);

          try {
            // Convert torrent to buffer
            const torrentFile = torrent.torrentFile;

            // Clean up after getting the file
            this.client.remove(magnetLink);

            if (torrentFile) {
              const buffer = Buffer.from(torrentFile);
              logger.info('MagnetService', `WebTorrent converted magnet in ${Date.now() - now}ms`);
              resolve(buffer);
            } else {
              reject(new Error('WebTorrent failed to create torrent file'));
            }
          } catch (error) {
            reject(error);
          }
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Get the URL for a torrent cache service based on its name and hash
   * @param serviceName The torrent cache service to use (itorrents, torCache, btCache)
   * @param hash The hash of the magnet link
   * @returns The URL to fetch the torrent file
   */
  private getUrl(serviceName: TorrentCacheService, hash: string): string {
    switch (serviceName) {
      case 'itorrents':
        return `https://itorrents.org/torrent/${hash.toUpperCase()}.torrent`;
      case 'torCache':
        return `https://torcache.net/torrent/${hash.toUpperCase()}.torrent`;
      case 'btCache':
        return `https://btcache.me/torrent/${hash.toLowerCase()}`;
    }
  }

  /**
   * Fetch with timeout, returning the Response object
   * This handles both the network request and rate limiting detection
   */
  private async fetch(url: string): Promise<Response | null> {
    try {
      logger.debug('MagnetService', `Fetching torrent from: ${url}`);

      // Use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Response not OK: ${response.status} ${response.statusText}`);
        }

        return response;
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug('MagnetService', `Fetch failed: ${errorMessage}`);
    }

    return null;
  }

  /**
   * Get the optimized service order for torrent retrieval
   */
  private getOptimizedServiceOrder(): TorrentRetrievalService[] {
    // Create array of service names
    const services = Object.keys(this.servicePerformance) as TorrentRetrievalService[];

    // Get current time for recency calculations
    const now = Date.now();

    // Calculate a weighted score for each service based on performance metrics
    // - Higher success rate is better
    // - Lower average response time is better
    // - Lower consecutive failures is better
    // - Services used less recently get a small boost (load balancing)
    // - Services with more total calls get a small penalty (avoid overuse)
    const calculateScore = (service: TorrentRetrievalService): number => {
      const perf = this.servicePerformance[service];
      const recencyFactor = Math.min(0.1, (now - perf.lastUsed) / (1000 * 60 * 60 * 24));
      const usagePenalty = Math.min(0.1, perf.totalCalls / 1000);

      // Calculate score based on performance metrics
      return (
        perf.successRate * 0.5 +
        (1 / (perf.avgResponseTime / 1000)) * 0.25 -
        perf.consecutiveFailures * 0.15 +
        recencyFactor * 0.05 -
        usagePenalty * 0.05
      );
    };

    // Sort services by an enhanced weighted scoring system
    return services
      .map(service => [service, calculateScore(service)] as const)
      .sort((a, b) => {
        return b[1] - a[1];
      })
      .map(([service]) => service);
  }

  /**
   * Update the performance metrics for a service
   */
  private updateServiceMetrics(
    serviceName: TorrentRetrievalService,
    success: boolean,
    start: number,
    end?: number
  ): void {
    const service = this.servicePerformance[serviceName];
    this.servicePerformance[serviceName].lastUsed = start;
    this.servicePerformance[serviceName].totalCalls++;

    if (success) {
      service.successfulCalls++;
      service.consecutiveFailures = 0; // Reset consecutive failures on success

      // Update success rate
      service.successRate = service.successfulCalls / service.totalCalls;

      // Update average response time
      if (end) {
        const responseTime = end - start;
        service.avgResponseTime =
          (service.avgResponseTime * (service.successfulCalls - 1) + responseTime) /
          service.successfulCalls;
      }
    } else {
      service.failures++;
      service.consecutiveFailures++;
      service.successRate = service.successfulCalls / service.totalCalls;
    }
  }

  /**
   * @returns Performance statistics for all services
   */
  public getServiceStatistics(): Record<
    string,
    {
      successRate: number;
      avgResponseTime: number;
      totalCalls: number;
      lastUsed: number;
      successfulCalls: number;
      failures: number;
      consecutiveFailures: number;
      isRateLimited: boolean;
      rateLimitInfo: {
        windowSize: number;
        limit: number;
        throttleMs: number;
      };
      rank: number;
    }
  > {
    const serviceOrder = this.getOptimizedServiceOrder();

    const stats: Record<
      string,
      {
        successRate: number;
        avgResponseTime: number;
        totalCalls: number;
        lastUsed: number;
        successfulCalls: number;
        failures: number;
        consecutiveFailures: number;
        isRateLimited: boolean;
        rateLimitInfo: {
          windowSize: number;
          limit: number;
          throttleMs: number;
        };
        rank: number;
      }
    > = {};

    serviceOrder.forEach((serviceName, index) => {
      const service = this.servicePerformance[serviceName];
      const rateLimiter = serviceName !== 'webTorrent' && this.rateLimiters[serviceName];

      stats[serviceName] = {
        successRate: service.successRate,
        avgResponseTime: service.avgResponseTime,
        totalCalls: service.totalCalls,
        lastUsed: service.lastUsed,
        successfulCalls: service.successfulCalls,
        failures: service.failures,
        consecutiveFailures: service.consecutiveFailures,
        isRateLimited: rateLimiter ? rateLimiter.getThrottle() > 0 : false,
        rateLimitInfo: rateLimiter
          ? {
              windowSize: 60000, // Using default values - would ideally come from DynamicRateLimit
              limit: 120, // Using default values - would ideally come from DynamicRateLimit
              throttleMs: rateLimiter.getThrottle(),
            }
          : {
              windowSize: 0, // No rate limiting for this service (e.g., WebTorrent)
              limit: 0,
              throttleMs: 0,
            },
        rank: index + 1,
      };
    });

    return stats;
  }

  /**
   * Clean up resources when the service is no longer needed
   * Call this method to ensure proper garbage collection
   */
  public dispose(): void {
    if (this.client) {
      try {
        // Remove all torrents
        this.client.torrents.forEach(torrent => {
          this.client.remove(torrent);
        });

        // Destroy client
        this.client.destroy();

        logger.info('MagnetService', 'WebTorrent client destroyed and resources cleaned up');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('MagnetService', `Error destroying WebTorrent client: ${errorMessage}`);
      }
    }
  }
}
