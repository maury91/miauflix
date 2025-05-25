import { logger } from '@logger';
import parseTorrent from 'parse-torrent';
import path from 'path';

import { DynamicRateLimit } from '@utils/dynamic-rate-limit';
import { ENV } from '@constants';

import { getTorrentFromITorrents } from './services/itorrents';
import { getTorrentFromTorrage } from './services/torrage';
import { ErrorWithStatus } from './services/utils';
import type { Service, ServiceData, ServicePerformance, ServiceStats } from './types';
import type { WebTorrentService } from './webtorrent.service';

/**
 * Generate a unique request ID
 */
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Service for getting torrent files from magnet links ( or hash )
 * Uses both WebTorrent and torrent cache services with adaptive optimization
 */
export class MagnetService {
  private readonly services: Record<string, ServiceData> = {};
  private readonly concurrency: number;
  private readonly queue: Array<{
    magnetLink: string;
    hash: string;
    onComplete: (result: Buffer | null) => void;
  }> = [];
  private activeWorkers = 0;

  constructor(webTorrentService: WebTorrentService) {
    this.createService('webTorrent', {
      maxConcurrentRequests: 50,
      shouldVerify: false,
      getTorrent: async (magnetLink: string, hash: string): Promise<Buffer> => {
        return webTorrentService.getTorrent(magnetLink, hash, 120000);
      },
    });

    this.createService('itorrents', {
      maxConcurrentRequests: 1,
      rateLimit: {
        windowSize: 60000, // 1 minute
        limit: 90, // 90 requests per minute
      },
      shouldVerify: true,
      getTorrent: async (
        _magnetLink: string,
        hash: string,
        rateLimiter?: DynamicRateLimit
      ): Promise<Buffer> => {
        const response = await getTorrentFromITorrents(hash, 5000);
        if (response) {
          rateLimiter?.reportResponse(response);
          if (response.ok) {
            return Buffer.from(await response.arrayBuffer());
          }
        }
        logger.warn(
          'MagnetService',
          `Failed to get torrent from iTorrents for hash: ${hash}, status code: ${response?.status}`
        );
        throw new ErrorWithStatus(
          `Failed to get torrent from iTorrents for hash: ${hash}, status code: ${response?.status}`,
          response?.status.toString(10) || 'unknown_error'
        );
      },
    });

    this.createService('torrage', {
      maxConcurrentRequests: 1,
      rateLimit: {
        windowSize: 60000, // 1 minute
        limit: 90, // 90 requests per minute
      },
      shouldVerify: true,
      getTorrent: async (
        _magnetLink: string,
        hash: string,
        rateLimiter?: DynamicRateLimit
      ): Promise<Buffer> => {
        const response = await getTorrentFromTorrage(hash, 5000);
        if (response) {
          rateLimiter?.reportResponse(response);
          if (response.ok) {
            return Buffer.from(await response.arrayBuffer());
          }
        }
        logger.warn(
          'MagnetService',
          `Failed to get torrent from Torrage for hash: ${hash}, status code: ${response?.status}`
        );
        throw new ErrorWithStatus(
          `Failed to get torrent from Torrage for hash: ${hash}, status code: ${response?.status}`,
          response?.status.toString(10) || 'unknown_error'
        );
      },
    });

    this.concurrency = Object.values(this.services).reduce((concurrency, service) => {
      return concurrency + service.config.maxConcurrentRequests;
    }, 0);

    logger.debug(
      'MagnetService',
      `Initialized with ${Object.keys(this.services).length} services and concurrency: ${this.concurrency}`
    );
  }

  /**
   * Get a torrent file from a magnet link and hash
   * @param magnetLink The magnet link to convert
   * @param hash The hash of the magnet link
   * @param preferIdle If true, prefer idle services over busy ones
   * @returns The torrent file as a Buffer, or null if conversion failed
   */
  public async getTorrent(
    magnetLink: string,
    hash: string,
    preferIdle: boolean = false
  ): Promise<Buffer | null> {
    logger.info(
      'MagnetService',
      `Converting magnet link with hash: ${hash}${preferIdle ? ' (preferring idle services)' : ''}`
    );
    this.createWorker();
    // Wait for the worker to process it
    return new Promise<Buffer | null>(resolve => {
      this.queue.push({ magnetLink, hash, onComplete: resolve });
    });
  }

  /**
   * Check if there are any idle services available
   * @returns True if there are any idle services available
   */
  public isIdle(): boolean {
    return this.getIdleServices().length > 0;
  }

  public getAvailableConcurrency(): number {
    return this.concurrency - this.activeWorkers;
  }

  private createService(name: string, service: Service) {
    this.services[name] = {
      activeRequests: new Set(),
      performance: {
        successRate: 0,
        avgResponseTime: 0,
        totalCalls: 0,
        successfulCalls: 0,
        failures: 0,
        consecutiveFailures: 0,
        lastUsed: 0,
        errors: [],
      },
      rateLimiter: service.rateLimit
        ? new DynamicRateLimit({
            ...service.rateLimit,
            storageFile: path.resolve(ENV('DATA_DIR'), `./rate-limits/${name}.json`),
          })
        : undefined,
      config: service,
    };
  }

  private async convertToTorrentWith(
    serviceName: string,
    magnetLink: string,
    hash: string
  ): Promise<Buffer | false | null> {
    const service = this.services[serviceName];
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }

    if (service.activeRequests.size >= service.config.maxConcurrentRequests) {
      logger.debug(
        'MagnetService',
        `Skipping ${serviceName} due to too many active requests (${service.activeRequests.size})`
      );
      return false;
    }
    logger.debug('MagnetService', `Searching ${hash} with ${serviceName}`);

    if (service.rateLimiter) {
      // Check if we need to throttle requests
      const throttleMs = service.rateLimiter.getThrottle();
      if (throttleMs > 0) {
        return false;
      }
    }

    const requestId = generateRequestId();
    const start = Date.now();
    service.activeRequests.add(requestId);
    let torrent: Buffer | null = null;
    let success = false;

    try {
      // Pass the rate limiter to services that need it
      torrent = await service.config.getTorrent(magnetLink, hash, service.rateLimiter);

      // Validate torrent if service requires validation
      if (torrent && service.config.shouldVerify) {
        const isValid = await this.validateTorrentBuffer(torrent, hash, serviceName);
        if (!isValid) {
          torrent = null; // Mark as invalid
        } else {
          success = true;
        }
      } else if (torrent) {
        // If no verification needed and we got a buffer, consider it successful
        success = true;
      }

      this.updateServiceMetrics(service.performance, success, start);

      return torrent;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('MagnetService', `Error using ${serviceName}: ${errorMessage}`);

      this.updateServiceMetrics(service.performance, false, start, error);

      return null;
    } finally {
      service.activeRequests.delete(requestId);
    }
  }

  private isServiceIdle(serviceName: string): boolean {
    const serviceData = this.services[serviceName];
    if (!serviceData) {
      throw new Error(`Service ${serviceName} not found`);
    }

    return serviceData.activeRequests.size < serviceData.config.maxConcurrentRequests;
  }

  /**
   * Get all idle services from the available services
   */
  private getIdleServices(): string[] {
    return Object.keys(this.services).filter(service => this.isServiceIdle(service));
  }

  private async processQueue() {
    const { magnetLink, hash, onComplete } = this.queue.shift()!;
    // Try all services with fallback mechanism
    let serviceOrder = this.getOptimizedServiceOrder();

    const idleServices = this.getIdleServices();
    // Try idle services first, then non-idle services
    const nonIdleServices = serviceOrder.filter(s => !idleServices.includes(s));
    serviceOrder = [...idleServices, ...nonIdleServices];

    for (const serviceName of serviceOrder) {
      const torrent = await this.convertToTorrentWith(serviceName, magnetLink, hash);

      if (torrent === false) {
        // Service was throttled, continue to next service
        logger.debug('MagnetService', `Service ${serviceName} was throttled, trying next service`);
        continue;
      }

      if (torrent) {
        // Success
        return onComplete(torrent);
      }

      // torrent is null, continue to next service
    }

    // All services failed
    logger.warn('MagnetService', `Could not convert magnet to torrent for hash: ${hash}`);
    return onComplete(null);
  }

  private workerCycle = async () => {
    while (this.queue.length > 0) {
      await this.processQueue();
    }
  };

  private createWorker(): void {
    if (this.activeWorkers < this.concurrency) {
      this.activeWorkers++;
      logger.debug('MagnetService', `Creating new worker, active workers: ${this.activeWorkers}`);
      setImmediate(this.workerCycle);
    }
  }

  /**
   * Validates that a buffer contains a valid torrent file
   * @param buffer The buffer to validate
   * @param hash The expected hash of the torrent (used for validation)
   * @param serviceName The service name for logging
   * @returns True if the buffer contains a valid torrent file
   */
  private async validateTorrentBuffer(
    buffer: Buffer,
    hash: string,
    serviceName: string
  ): Promise<boolean> {
    try {
      // Try to parse the torrent file
      const parsed = await parseTorrent(buffer);

      // Verify that essential torrent properties exist
      if (!parsed || !parsed.infoHash) {
        logger.warn('MagnetService', 'Invalid torrent: Missing info hash');
        return false;
      }

      // Verify the hash matches what we expect
      if (parsed.infoHash.toLowerCase() !== hash.toLowerCase()) {
        logger.warn(
          'MagnetService',
          `Hash mismatch for ${serviceName}:`,
          `expected: ${hash}, got: ${parsed.infoHash}`
        );
        return false;
      }

      return true;
    } catch (error) {
      logger.warn('MagnetService', `Error validating torrent buffer:`, error);
      return false;
    }
  }

  /**
   * Get the optimized service order for torrent retrieval
   */
  private getOptimizedServiceOrder(): string[] {
    // Create array of service names
    const services = Object.keys(this.services);

    // Get current time for recency calculations
    const now = Date.now();

    // Calculate a weighted score for each service based on performance metrics
    // - Higher success rate is better
    // - Lower average response time is better
    // - Lower consecutive failures is better
    // - Services used less recently get a small boost (load balancing)
    // - Services with more total calls get a small penalty (avoid overuse)
    const calculateScore = (service: string): number => {
      const { performance } = this.services[service];
      const recencyFactor = Math.min(0.1, (now - performance.lastUsed) / (1000 * 60 * 60 * 24));
      const usagePenalty = Math.min(0.1, performance.totalCalls / 1000);

      // Calculate score based on performance metrics
      return (
        performance.successRate * 0.5 +
        (1 / (performance.avgResponseTime / 1000)) * 0.25 -
        performance.consecutiveFailures * 0.15 +
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
    performance: ServicePerformance,
    success: boolean,
    start: number,
    error?: ErrorWithStatus | unknown
  ): void {
    const end = Date.now();
    performance.lastUsed = start;
    performance.totalCalls++;

    if (success) {
      performance.successfulCalls++;
      performance.consecutiveFailures = 0; // Reset consecutive failures on success

      // Update success rate
      performance.successRate = performance.successfulCalls / performance.totalCalls;

      // Update average response time
      const responseTime = end - start;
      performance.avgResponseTime =
        (performance.avgResponseTime * (performance.successfulCalls - 1) + responseTime) /
        performance.successfulCalls;
    } else {
      performance.failures++;
      performance.consecutiveFailures++;
      performance.successRate = performance.successfulCalls / performance.totalCalls;
      if (error instanceof ErrorWithStatus) {
        performance.errors.push(error.status);
      }
    }
  }

  /**
   * @returns Performance statistics for all services
   */
  public getServiceStatistics(): Record<string, ServiceStats> {
    const serviceOrder = this.getOptimizedServiceOrder();

    const stats: Record<string, ServiceStats> = {};

    serviceOrder.forEach((serviceName, index) => {
      const service = this.services[serviceName];
      const rateLimiter = service.rateLimiter;

      stats[serviceName] = {
        successRate: service.performance.successRate,
        avgResponseTime: service.performance.avgResponseTime,
        totalCalls: service.performance.totalCalls,
        lastUsed: service.performance.lastUsed,
        successfulCalls: service.performance.successfulCalls,
        failures: service.performance.failures,
        consecutiveFailures: service.performance.consecutiveFailures,
        isRateLimited: rateLimiter ? rateLimiter.getThrottle() > 0 : false,
        activeRequests: service.activeRequests.size,
        errors: service.performance.errors.reduce(
          (groupedErrors, error) => {
            if (!groupedErrors[error]) {
              groupedErrors[error] = 0;
            }
            groupedErrors[error]++;
            return groupedErrors;
          },
          {} as Record<string, number>
        ),
        rateLimitInfo: rateLimiter
          ? {
              windowSize: rateLimiter.getRateLimit().windowSize,
              limit: rateLimiter.getRateLimit().limit,
              throttleMs: rateLimiter.getThrottle(),
              stats: rateLimiter.getStats(),
            }
          : null,
        rank: index + 1,
      };
    });

    return stats;
  }
}
