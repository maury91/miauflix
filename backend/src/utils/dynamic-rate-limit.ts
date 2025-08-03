import { logger } from '@logger';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';

/**
 * Response statistics for tracking API rate limit behavior
 */
interface ResponseData {
  timestamp: number;
  wasRateLimited: boolean;
  statusCode: number;
  headers: Record<string, string>;
}

/**
 * Statistics about the rate limiter's behavior
 */
export interface RateLimitStats {
  estimatedWindowSize: number; // ms
  estimatedLimit: number; // requests per window
  totalRequests: number;
  rateLimitedRequests: number;
  consecutiveSuccess: number;
  consecutiveFailures: number;
  lastRateLimitDetected: number | null;
  lastSuccessfulRequest: number | null;
  throttleRecommendation: number; // ms to wait
  confidence: number; // 0-1, how confident we are in our estimates
}

/**
 * Rate limit parameters
 */
export interface RateLimit {
  windowSize: number; // ms
  limit: number; // requests per window
}

/**
 * Dynamic rate limit detection and adaptation
 * This class helps detect and adapt to API rate limits dynamically
 */
export class DynamicRateLimit {
  // Configurable defaults
  private readonly initialWindowSize: number; // ms
  private readonly initialLimit: number; // requests per window
  private readonly storageFile: string; // Optional file for persistent storage

  // Current estimates
  private windowSize: number; // ms
  private limit: number; // requests per window

  // Tracking
  private responseHistory: ResponseData[] = [];
  private rateLimitDetections: number[] = [];
  private consecutiveSuccess = 0;
  private consecutiveFailures = 0;
  private totalRequests = 0;
  private rateLimitedRequests = 0;
  private lastRateLimitDetected: number | null = null;
  private lastSuccessfulRequest: number | null = null;
  private iterations = 0; // Number of rate limit cycles observed
  private confidence = 0.1; // Starts low and increases as we gather data

  // Constants
  private readonly MAX_HISTORY_ITEMS = 100;
  private readonly MAX_RATE_LIMIT_DETECTIONS = 10;
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.7;
  private readonly MAX_WINDOW_SIZE = 60 * 60 * 1000; // 1 hour max
  private readonly MIN_WINDOW_SIZE = 100; // 100ms min
  private readonly MAX_LIMIT = 1000; // Max 1000 requests per window
  private readonly MIN_LIMIT = 1; // Min 1 request per window
  private readonly BACKOFF_FACTOR = 1.5; // Exponential backoff factor when rate limited

  /**
   * Create a new DynamicRateLimit
   * @param options Configuration options
   * @param options.windowSize Initial window size in milliseconds (default: 1000)
   * @param options.limit Initial limit within the window (default: 10)
   */
  constructor(options: { windowSize?: number; limit?: number; storageFile?: string } = {}) {
    // Set initial values
    this.initialWindowSize = options.windowSize || 1000; // Default 1 second
    this.initialLimit = options.limit || 10; // Default 10 requests per second

    this.windowSize = this.initialWindowSize;
    this.limit = this.initialLimit;
    this.storageFile = options.storageFile || '';

    this.loadStatus();

    logger.debug(
      'DynamicRateLimit',
      `Initialized with window: ${this.windowSize}ms, limit: ${this.limit} requests`
    );
  }

  /**
   * Get the recommended throttle time to wait before making the next request
   * @returns Milliseconds to wait before next request, 0 if no wait needed
   */
  public getThrottle(): number {
    const now = Date.now();

    // Clean up old history beyond the estimated window size
    this.cleanHistory(now);

    // Count recent requests within current window
    const windowStart = now - this.windowSize;
    const recentRequests = this.responseHistory.filter(r => r.timestamp >= windowStart).length;

    // If we're within our estimated limit, no throttling needed
    if (recentRequests < this.limit) {
      return 0;
    }

    // We need to throttle. Calculate time until oldest request exits the window
    if (recentRequests > 0 && this.responseHistory.length > this.limit) {
      // Find the oldest request that will exit the window
      const oldestRelevantRequest = this.responseHistory[this.responseHistory.length - this.limit];
      const timeUntilWindowOpens = oldestRelevantRequest.timestamp + this.windowSize - now;

      // Apply a safety factor based on our confidence
      const safetyFactor = 1 + (1 - this.confidence);
      const throttleTime = Math.max(0, Math.ceil(timeUntilWindowOpens * safetyFactor));

      // When confidence is low, add exponential backoff based on consecutive failures
      if (this.confidence < this.HIGH_CONFIDENCE_THRESHOLD && this.consecutiveFailures > 0) {
        const backoffMs = Math.min(
          1000 * Math.pow(this.BACKOFF_FACTOR, this.consecutiveFailures),
          this.windowSize / 2
        );
        return throttleTime + backoffMs;
      }

      return throttleTime;
    }

    // Default small throttle when unsure
    return this.windowSize / (this.limit + 1);
  }

  /**
   * Report an API response to help the rate limiter learn
   * @param response The HTTP response from the API
   * @returns Whether the response indicated rate limiting
   */
  public reportResponse(response: Response): boolean {
    const now = Date.now();
    this.totalRequests++;

    // Detect if the response indicates rate limiting
    const wasRateLimited = this.isRateLimited(response);

    // Extract headers to a record
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Track the response
    this.responseHistory.unshift({
      timestamp: now,
      wasRateLimited,
      statusCode: response.status,
      headers,
    });

    // Trim history if it gets too long
    if (this.responseHistory.length > this.MAX_HISTORY_ITEMS) {
      this.responseHistory.pop();
    }

    // Try to extract rate limit information from headers using our record
    this.extractRateLimitInfoFromHeaders(headers);

    // Update tracking counters
    if (wasRateLimited) {
      this.handleRateLimitedResponse(now);
    } else {
      this.handleSuccessfulResponse(now);
    }

    // After collecting enough data, refine our estimates
    this.updateRateLimitEstimates();

    // Check if the behavior is sporadic
    this.checkForSporadicBehavior();

    return wasRateLimited;
  }

  private async loadStatus() {
    if (this.storageFile) {
      try {
        const data = JSON.parse(await readFile(this.storageFile, 'utf-8'));
        if (data) {
          this.windowSize = data.windowSize || this.initialWindowSize;
          this.limit = data.limit || this.initialLimit;
          this.responseHistory = data.responseHistory || [];
          this.rateLimitDetections = data.rateLimitDetections || [];
          this.consecutiveSuccess = data.consecutiveSuccess || 0;
          this.consecutiveFailures = data.consecutiveFailures || 0;
          this.totalRequests = data.totalRequests || 0;
          this.rateLimitedRequests = data.rateLimitedRequests || 0;
          this.lastRateLimitDetected = data.lastRateLimitDetected || null;
          this.lastSuccessfulRequest = data.lastSuccessfulRequest || null;
          this.iterations = data.iterations || 0;
          this.confidence = data.confidence || 0.1;
          logger.debug(
            'DynamicRateLimit',
            `Loaded status from file: window=${this.windowSize}ms, limit=${this.limit} requests`
          );
        }
      } catch (error) {
        // If the file doesn't exist, that's fine - we'll start with defaults
        // Only log as error if it's not a "file not found" error
        if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
          logger.error('DynamicRateLimit', 'Failed to load status from file:', error);
        } else {
          logger.debug('DynamicRateLimit', 'No existing status file found, starting with defaults');
        }
      }
    }
  }

  private async saveStatus() {
    if (this.storageFile) {
      try {
        const data = {
          windowSize: this.windowSize,
          limit: this.limit,
          responseHistory: this.responseHistory,
          rateLimitDetections: this.rateLimitDetections,
          consecutiveSuccess: this.consecutiveSuccess,
          consecutiveFailures: this.consecutiveFailures,
          totalRequests: this.totalRequests,
          rateLimitedRequests: this.rateLimitedRequests,
          lastRateLimitDetected: this.lastRateLimitDetected,
          lastSuccessfulRequest: this.lastSuccessfulRequest,
          iterations: this.iterations,
          confidence: this.confidence,
        };

        await mkdir(dirname(this.storageFile), { recursive: true });
        await writeFile(this.storageFile, JSON.stringify(data, null, 2), 'utf-8');
        logger.debug('DynamicRateLimit', 'Saved status to file');
      } catch (error) {
        logger.error('DynamicRateLimit', 'Failed to save status to file:', error);
      }
    }
  }

  /**
   * Extract rate limit information from response headers to improve our estimates
   */
  private extractRateLimitInfoFromHeaders(headers: Record<string, string>): void {
    // Look for explicit rate limit information

    // 1. Try to get the limit from headers
    const limitHeaders = [
      headers['x-ratelimit-limit'],
      headers['ratelimit-limit'],
      headers['x-rate-limit-limit'],
    ].filter(Boolean);

    if (limitHeaders.length > 0) {
      // Parse the first valid limit header
      for (const limitHeader of limitHeaders) {
        const parsedLimit = parseInt(limitHeader || '0', 10);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          // If the API tells us the limit explicitly, use it (with high confidence)
          if (Math.abs(parsedLimit - this.limit) / this.limit > 0.2) {
            // If significantly different
            this.limit = parsedLimit;
            this.confidence = Math.min(1.0, this.confidence + 0.3);
            logger.debug('DynamicRateLimit', `Setting limit to ${this.limit} from headers`);
          }
          break;
        }
      }
    }

    // 2. Try to get window size from reset headers
    const resetHeaders = [
      headers['x-ratelimit-reset'],
      headers['ratelimit-reset'],
      headers['retry-after'],
    ].filter(Boolean);

    if (resetHeaders.length > 0) {
      for (const resetHeader of resetHeaders) {
        if (!resetHeader) continue;

        // Some APIs use epoch time, others use seconds from now
        let resetValue = parseInt(resetHeader, 10);
        if (isNaN(resetValue)) continue;

        // If reset value is small (< 1 hour), it's probably seconds from now
        if (resetValue < 60 * 60) {
          // Convert seconds to milliseconds for window size
          const newWindowSize = resetValue * 1000;

          // If it's a reasonable window size, use it
          if (newWindowSize > this.MIN_WINDOW_SIZE && newWindowSize < this.MAX_WINDOW_SIZE) {
            this.windowSize = newWindowSize;
            this.confidence = Math.min(1.0, this.confidence + 0.3);
            logger.debug(
              'DynamicRateLimit',
              `Setting window size to ${this.windowSize}ms from headers`
            );
          }
          break;
        }
        // Otherwise it could be epoch time - we'd need to compare with current time
        else {
          // Check if it's a reasonable epoch time (not too far in the future)
          const now = Math.floor(Date.now() / 1000); // Current epoch in seconds
          if (resetValue > now && resetValue < now + this.MAX_WINDOW_SIZE / 1000) {
            const newWindowSize = (resetValue - now) * 1000;
            this.windowSize = newWindowSize;
            this.confidence = Math.min(1.0, this.confidence + 0.3);
            logger.debug(
              'DynamicRateLimit',
              `Setting window size to ${this.windowSize}ms from epoch reset time`
            );
          }
          break;
        }
      }
    }
  }

  /**
   * Get statistics about the rate limiter's behavior and estimates
   */
  public getStats(): RateLimitStats {
    return {
      estimatedWindowSize: this.windowSize,
      estimatedLimit: this.limit,
      totalRequests: this.totalRequests,
      rateLimitedRequests: this.rateLimitedRequests,
      consecutiveSuccess: this.consecutiveSuccess,
      consecutiveFailures: this.consecutiveFailures,
      lastRateLimitDetected: this.lastRateLimitDetected,
      lastSuccessfulRequest: this.lastSuccessfulRequest,
      throttleRecommendation: this.getThrottle(),
      confidence: this.confidence,
    };
  }

  /**
   * Get the current estimated rate limit parameters
   */
  public getRateLimit(): RateLimit {
    return {
      windowSize: this.windowSize,
      limit: this.limit,
    };
  }

  /**
   * Helper method to determine if a response indicates rate limiting
   */
  private isRateLimited(response: Response): boolean {
    // Check HTTP status code (common rate limit status codes)
    if (response.status === 429) {
      // Too Many Requests - primary rate limit indicator
      return true;
    }

    // Sometimes rate limits appear as other status codes
    if (response.status === 403 || response.status === 503 || response.status === 400) {
      // Look for rate limit keywords in the response body or headers
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('json') || contentType.includes('text')) {
        // We'd check the body here, but since Response body can only be consumed once,
        // we'll rely on status codes and headers instead for now
      }

      return true;
    }

    // Extract headers to check them
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Check for rate limit headers - different APIs use different headers
    const rateLimitHeaders = [
      // Check if we're explicitly at zero remaining requests
      headers['x-ratelimit-remaining'] === '0',
      headers['ratelimit-remaining'] === '0',
      headers['x-rate-limit-remaining'] === '0',

      // Check if retry-after header exists
      headers['retry-after'] !== undefined,
      headers['ratelimit-reset'] !== undefined,

      // Check for custom rate limit headers
      headers['x-ratelimit-reset-after'] !== undefined,
    ];

    if (rateLimitHeaders.some(Boolean)) {
      return true;
    }

    return false;
  }

  /**
   * Handle a rate limited response
   * @param timestamp The time when the rate limit was hit
   */
  private handleRateLimitedResponse(timestamp: number): void {
    this.rateLimitedRequests++;
    this.consecutiveFailures++;
    this.consecutiveSuccess = 0;
    this.lastRateLimitDetected = timestamp;

    // Track rate limit detection time for window size estimation
    this.rateLimitDetections.unshift(timestamp);
    if (this.rateLimitDetections.length > this.MAX_RATE_LIMIT_DETECTIONS) {
      this.rateLimitDetections.pop();
    }

    // Adjust our limit estimation based on recent history
    // (How many requests did we make before hitting the limit?)
    const recentResponses = this.responseHistory.filter(
      r => r.timestamp >= timestamp - this.windowSize && r.timestamp <= timestamp
    );

    // Count successful requests just before this rate limit
    const successfulRequests = recentResponses.filter(r => !r.wasRateLimited).length;

    // If we have data about requests before hitting the limit, use it to refine our limit estimation
    if (successfulRequests > 0) {
      // Use slightly lower than observed limit to be safe
      const newLimit = Math.max(this.MIN_LIMIT, Math.floor(successfulRequests * 0.9));

      // If the new limit is significantly lower than current, adjust quickly
      if (newLimit < this.limit * 0.8) {
        this.limit = newLimit;
        this.confidence = Math.min(0.9, this.confidence + 0.2); // Increase confidence on detection

        logger.debug(
          'DynamicRateLimit',
          `Adjusted rate limit to ${this.limit} based on observed rate limiting`
        );
      } else {
        // Otherwise blend gradually
        this.limit = Math.round(this.limit * 0.7 + newLimit * 0.3);
      }
    }

    logger.debug(
      'DynamicRateLimit',
      `Rate limit detected. Total: ${this.rateLimitedRequests}, Consecutive: ${this.consecutiveFailures}`
    );
  }

  /**
   * Handle a successful (non-rate-limited) response
   */
  private handleSuccessfulResponse(timestamp: number): void {
    this.consecutiveSuccess++;
    this.consecutiveFailures = 0;
    this.lastSuccessfulRequest = timestamp;

    // If we're being consistently successful, gradually increase our limits
    // This helps adapt to changing API behavior over time
    if (this.consecutiveSuccess > 5) {
      // Gradually increase limit as we observe more successful requests
      const increaseFactor = Math.min(1.1, 1.0 + this.consecutiveSuccess / 100);
      this.limit = Math.min(this.MAX_LIMIT, Math.ceil(this.limit * increaseFactor));

      // More gradually increase our window size estimate
      // This helps adapt to larger windows over time
      if (this.iterations > 1) {
        // Small chance to try a larger window size (exploration)
        if (Math.random() < 0.1) {
          const newWindowSize = Math.min(this.MAX_WINDOW_SIZE, Math.round(this.windowSize * 1.2));
          this.windowSize = newWindowSize;
          logger.debug('DynamicRateLimit', `Exploring larger window size: ${this.windowSize}ms`);
        }
      }
    }

    // If we get a successful response after previously detecting rate limits,
    // this may indicate the end of a rate limit window
    if (this.lastRateLimitDetected !== null) {
      const timeSinceRateLimit = timestamp - this.lastRateLimitDetected;

      // If this is our first successful request after hitting a rate limit,
      // it may indicate the rate limit window duration
      if (this.consecutiveSuccess === 1 && timeSinceRateLimit > 0) {
        // Only use this for window size estimation if it seems reasonable
        if (timeSinceRateLimit < this.MAX_WINDOW_SIZE) {
          logger.debug(
            'DynamicRateLimit',
            `Potential window size detected: ${timeSinceRateLimit}ms (previous: ${this.windowSize}ms)`
          );

          // If this is our first iteration, be more aggressive in learning
          if (this.iterations === 0) {
            this.windowSize = timeSinceRateLimit;
          } else {
            // Otherwise, blend with existing estimate (weighted by confidence)
            this.windowSize = Math.round(this.windowSize * 0.7 + timeSinceRateLimit * 0.3);
          }

          // We've completed an iteration (hit rate limit and recovered)
          this.iterations++;
          // Increase confidence with each iteration
          this.confidence = Math.min(0.85, this.confidence + 0.1);
        }
      }
    }
  }

  /**
   * Update rate limit estimates based on observed behavior
   */
  private updateRateLimitEstimates(): void {
    // Only start making adjustments after we've seen some rate limits
    if (this.rateLimitDetections.length < 2 || this.iterations === 0) {
      return;
    }

    // Estimate the limit based on observed requests before hitting rate limits
    if (this.responseHistory.length > 1) {
      // Find clusters of non-rate-limited requests before rate limits
      const requestsBeforeRateLimit = this.findRequestsBeforeRateLimit();

      if (requestsBeforeRateLimit > 0) {
        // Apply a safety factor to be conservative
        const safetyFactor = 0.9;
        const newLimit = Math.max(
          this.MIN_LIMIT,
          Math.floor(requestsBeforeRateLimit * safetyFactor)
        );

        // Adjust our limit based on the new data, weighted by our confidence
        this.limit = Math.round(
          this.limit * (1 - this.confidence * 0.5) + newLimit * (this.confidence * 0.5)
        );

        logger.debug(
          'DynamicRateLimit',
          `Adjusted rate limit to: ${this.limit} requests per ${this.windowSize}ms window (confidence: ${this.confidence.toFixed(2)})`
        );
      }
    }

    // If we've observed multiple rate limit cycles, try to determine window size from the intervals
    if (this.rateLimitDetections.length >= 2) {
      let totalInterval = 0;
      let intervalCount = 0;

      // Calculate average interval between rate limit detections
      for (let i = 0; i < this.rateLimitDetections.length - 1; i++) {
        const interval = this.rateLimitDetections[i] - this.rateLimitDetections[i + 1];
        if (interval > this.MIN_WINDOW_SIZE && interval < this.MAX_WINDOW_SIZE) {
          totalInterval += interval;
          intervalCount++;
        }
      }

      if (intervalCount > 0) {
        const avgInterval = totalInterval / intervalCount;

        // If we have a reasonable interval, adjust our window size estimation
        if (avgInterval > this.MIN_WINDOW_SIZE) {
          // Weight based on confidence and number of samples
          const newConfidence = Math.min(0.9, 0.3 + (intervalCount / 10) * 0.6);

          // Adjust window size, weighted by our confidence
          const newWindowSize = Math.round(
            this.windowSize * (1 - newConfidence) + avgInterval * newConfidence
          );

          // Only change if significantly different
          if (Math.abs(newWindowSize - this.windowSize) / this.windowSize > 0.1) {
            this.windowSize = newWindowSize;
            this.confidence = Math.max(this.confidence, newConfidence);

            logger.debug(
              'DynamicRateLimit',
              `Adjusted window size to ${this.windowSize}ms based on ${intervalCount} intervals (confidence: ${this.confidence.toFixed(2)})`
            );
          }
        }
      }
    }

    this.checkForSporadicBehavior();
    this.saveStatus();
  }

  /**
   * Check if the API is showing sporadic rate limiting behavior
   * and adjust confidence accordingly
   */
  private checkForSporadicBehavior(): void {
    // If we don't have enough data yet, skip
    if (this.responseHistory.length < 10) return;

    const recent = this.responseHistory.slice(0, 20);

    // Calculate inconsistency score by looking at patterns of rate limiting
    let rateLimitedCount = 0;
    let patternChanges = 0;
    let lastWasRateLimited = false;

    for (const response of recent) {
      if (response.wasRateLimited) {
        rateLimitedCount++;
        if (!lastWasRateLimited) {
          patternChanges++;
        }
      } else if (lastWasRateLimited) {
        patternChanges++;
      }
      lastWasRateLimited = response.wasRateLimited;
    }

    // Calculate what percentage of responses are rate limited
    const rateLimitPercentage = rateLimitedCount / recent.length;

    // If behavior seems sporadic (frequent changes in rate limit status and not too many rate limits)
    if (patternChanges > 5 && rateLimitPercentage < 0.5 && rateLimitPercentage > 0.05) {
      // Lower confidence for sporadic behavior
      this.confidence = Math.min(this.confidence, 0.7);

      // Adjust rate limit to be more conservative
      if (this.rateLimitedRequests > 3) {
        this.limit = Math.max(1, Math.floor(this.limit * 0.85));
        logger.debug(
          'DynamicRateLimit',
          `Detected sporadic rate limiting, reducing limit to ${this.limit}`
        );
      }
    }
  }

  /**
   * Find the average number of requests made before hitting rate limits
   */
  private findRequestsBeforeRateLimit(): number {
    let totalRequests = 0;
    let segments = 0;
    let currentSegmentSize = 0;

    // Scan the history for sequences of successes followed by failures
    for (let i = this.responseHistory.length - 1; i >= 0; i--) {
      const current = this.responseHistory[i];

      if (!current.wasRateLimited) {
        currentSegmentSize++;
      } else if (currentSegmentSize > 0) {
        // We hit a rate limit after some successful requests
        totalRequests += currentSegmentSize;
        segments++;
        currentSegmentSize = 0;
      }
    }

    // Return average or 0 if no segments found
    return segments > 0 ? totalRequests / segments : 0;
  }

  /**
   * Clean up response history older than our window
   */
  private cleanHistory(now: number): void {
    // Keep twice the window size to have enough history for analysis
    const cutoff = now - this.windowSize * 2;
    let cutIndex = this.responseHistory.findIndex(r => r.timestamp < cutoff);

    if (cutIndex > 0) {
      // Keep at least some history for analysis
      cutIndex = Math.min(cutIndex, this.responseHistory.length - 10);
      if (cutIndex > 0) {
        this.responseHistory = this.responseHistory.slice(0, cutIndex);
      }
    }
  }
}
