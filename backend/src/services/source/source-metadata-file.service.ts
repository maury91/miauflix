import { logger } from '@logger';
import parseTorrent from 'parse-torrent';
import path from 'path';

import { ENV } from '@constants';
import type { RequestService } from '@services/request/request.service';
import { DynamicRateLimit } from '@utils/dynamic-rate-limit';

import type { DownloadService } from '../download/download.service';
import { ErrorWithStatus } from './services/error-with-status.util';
import { getSourceMetadataFileFromITorrents } from './services/itorrents';
import { getSourceMetadataFileFromTorrage } from './services/torrage';
import type {
  Service,
  ServiceData,
  ServicePerformance,
  ServiceShortStats,
  ServiceStats,
} from './types';

/**
 * Generate a unique request ID
 */
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Service for getting source files from URI links ( or identifier )
 * Uses both WebTorrent and online cache services with adaptive optimization
 */
export class SourceMetadataFileService {
  private readonly services: Record<string, ServiceData> = {};
  private readonly concurrency: number;
  private readonly queue: Array<{
    sourceLink: string;
    hash: string;
    onComplete: (result: Buffer | null) => void;
  }> = [];
  private activeWorkers = 0;

  constructor(
    private readonly downloadService: DownloadService,
    private readonly requestService: RequestService
  ) {
    this.createService('webTorrent', {
      maxConcurrentRequests: 50,
      shouldVerify: false,
      getSourceMetadata: async (sourceLink: string, hash: string): Promise<Buffer> => {
        return downloadService.getSourceMetadataFile(sourceLink, hash, 120000);
      },
    });

    this.createService('itorrents', {
      maxConcurrentRequests: 1,
      rateLimit: {
        windowSize: 60000, // 1 minute
        limit: 90, // 90 requests per minute
      },
      shouldVerify: true,
      getSourceMetadata: async (
        _magnetLink: string,
        hash: string,
        rateLimiter?: DynamicRateLimit
      ): Promise<Buffer> => {
        const response = await getSourceMetadataFileFromITorrents(hash, 5000, this.requestService);
        if (response) {
          rateLimiter?.reportResponse(response);
          if (response.ok) {
            if (response.body instanceof ArrayBuffer) {
              return Buffer.from(response.body);
            }
            if (typeof response.body === 'string') {
              return Buffer.from(response.body, 'binary');
            }
            throw new Error('Invalid response body');
          }
        }
        logger.warn(
          'DataResolver',
          `Failed to get data from iTorrents for identifier: ${hash}, status code: ${response?.status}`
        );
        throw new ErrorWithStatus(
          `Failed to get data from iTorrents for identifier: ${hash}, status code: ${response?.status}`,
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
      getSourceMetadata: async (
        _magnetLink: string,
        hash: string,
        rateLimiter?: DynamicRateLimit
      ): Promise<Buffer> => {
        const response = await getSourceMetadataFileFromTorrage(hash, 5000, this.requestService);
        if (response) {
          rateLimiter?.reportResponse(response);
          if (response.ok) {
            if (typeof response.body === 'string') {
              return Buffer.from(response.body, 'binary');
            }
            throw new Error('Invalid response body');
          }
        }
        logger.warn(
          'DataResolver',
          `Failed to get data from Torrage for identifier: ${hash}, status code: ${response?.status}`
        );
        throw new ErrorWithStatus(
          `Failed to get data from Torrage for identifier: ${hash}, status code: ${response?.status}`,
          response?.status.toString(10) || 'unknown_error'
        );
      },
    });

    this.concurrency = Object.values(this.services).reduce((concurrency, service) => {
      return concurrency + service.config.maxConcurrentRequests;
    }, 0);

    logger.debug(
      'DataResolver',
      `Initialized with ${Object.keys(this.services).length} services and concurrency: ${this.concurrency}`
    );
  }

  /**
   * Get a source metadata file from a magnet link and hash
   * @param sourceLink The magnet link to convert
   * @param hash The hash of the magnet link
   * @param preferIdle If true, prefer idle services over busy ones
   * @returns The source metadata file as a Buffer, or null if conversion failed
   */
  public async getSourceMetadataFile(
    sourceLink: string,
    hash: string,
    preferIdle: boolean = false
  ): Promise<Buffer | null> {
    logger.info(
      'DataResolver',
      `Converting URI link with identifier: ${hash.substring(0, 6)}-redacted-${preferIdle ? ' (preferring idle services)' : ''}`
    );
    this.createWorker();
    // Wait for the worker to process it
    return new Promise<Buffer | null>(resolve => {
      this.queue.push({ sourceLink: sourceLink, hash, onComplete: resolve });
    });
  }

  public async getStats(hash: string): Promise<{ broadcasters: number; watchers: number }> {
    return this.downloadService.getStats(hash);
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

  private async convertToFileWith(
    serviceName: string,
    sourceLink: string,
    hash: string
  ): Promise<Buffer | false | null> {
    const service = this.services[serviceName];
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }

    if (service.activeRequests.size >= service.config.maxConcurrentRequests) {
      logger.debug(
        'DataResolver',
        `Skipping ${serviceName} due to too many active requests (${service.activeRequests.size})`
      );
      return false;
    }
    logger.debug('DataResolver', `Searching with ${serviceName}`);

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
    let file: Buffer | null = null;
    let success = false;

    try {
      // Pass the rate limiter to services that need it
      file = await service.config.getSourceMetadata(sourceLink, hash, service.rateLimiter);

      // Validate source metadata file if service requires validation
      if (file && service.config.shouldVerify) {
        const isValid = await this.validateSourceMetadataBuffer(file, hash, serviceName);
        if (!isValid) {
          file = null; // Mark as invalid
        } else {
          success = true;
        }
      } else if (file) {
        // If no verification needed and we got a buffer, consider it successful
        success = true;
      }

      this.updateServiceMetrics(service.performance, success, start);

      return file;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('DataResolver', `Error using ${serviceName}: ${errorMessage}`);

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
    const { sourceLink: magnetLink, hash, onComplete } = this.queue.shift()!;
    // Try all services with fallback mechanism
    let serviceOrder = this.getOptimizedServiceOrder();

    const idleServices = this.getIdleServices();
    // Try idle services first, then non-idle services
    const nonIdleServices = serviceOrder.filter(s => !idleServices.includes(s));
    serviceOrder = [...idleServices, ...nonIdleServices];

    for (const serviceName of serviceOrder) {
      const file = await this.convertToFileWith(serviceName, magnetLink, hash);

      if (file === false) {
        // Service was throttled, continue to next service
        logger.debug('DataResolver', `Service ${serviceName} was throttled, trying next service`);
        continue;
      }

      if (file) {
        // Success
        return onComplete(file);
      }

      // file is null, continue to next service
    }

    // All services failed
    logger.warn('DataResolver', `Could not convert URI to file after trying all services`);
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
      logger.debug('DataResolver', `Creating new worker, active workers: ${this.activeWorkers}`);
      setImmediate(this.workerCycle);
    }
  }

  /**
   * Validates that a buffer contains a valid source metadata file
   * @param buffer The buffer to validate
   * @param hash The expected hash of the source metadata file (used for validation)
   * @param serviceName The service name for logging
   * @returns True if the buffer contains a valid source metadata file
   */
  private async validateSourceMetadataBuffer(
    buffer: Buffer,
    hash: string,
    serviceName: string
  ): Promise<boolean> {
    try {
      // Try to parse the source metadata file
      const parsed = await parseTorrent(buffer);

      // Verify that essential source metadata properties exist
      if (!parsed || !parsed.infoHash) {
        logger.warn('DataResolver', 'Invalid data: Missing identifier');
        return false;
      }

      // Verify the hash matches what we expect
      if (parsed.infoHash.toLowerCase() !== hash.toLowerCase()) {
        logger.warn(
          'DataResolver',
          `Identifier mismatch detected for ${serviceName} - file validation failed`
        );
        return false;
      }

      return true;
    } catch (error) {
      logger.warn('DataResolver', `Error validating file buffer:`, error);
      return false;
    }
  }

  /**
   * Get the optimized service order for source metadata file retrieval
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

  public status(): Record<string, ServiceShortStats> {
    return Object.keys(this.services).reduce(
      (status, serviceName) => {
        const service = this.services[serviceName];
        status[serviceName] = {
          successRate: service.performance.successRate * 100,
          queued: service.activeRequests.size,
          avgResponseTime: service.performance.avgResponseTime,
          totalCalls: service.performance.totalCalls,
          successfulCalls: service.performance.successfulCalls,
          failures: service.performance.failures,
        };
        return status;
      },
      {} as Record<string, ServiceShortStats>
    );
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
