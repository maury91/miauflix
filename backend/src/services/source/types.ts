import type { DynamicRateLimit } from '@utils/dynamic-rate-limit';

export interface ServicePerformance {
  successRate: number;
  avgResponseTime: number;
  totalCalls: number;
  successfulCalls: number;
  failures: number;
  consecutiveFailures: number;
  lastUsed: number;
  errors: string[];
}

export interface Service {
  maxConcurrentRequests: number;
  rateLimit?: {
    windowSize: number; // in milliseconds
    limit: number;
  };
  shouldVerify: boolean; // Whether to verify the torrent file after retrieval
  getTorrent(magnetLink: string, hash: string, rateLimiter?: DynamicRateLimit): Promise<Buffer>;
}

export interface ServiceData {
  activeRequests: Set<string>;
  config: Service;
  performance: ServicePerformance;
  rateLimiter?: DynamicRateLimit;
}

export interface ServiceStats {
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
    stats: object;
  } | null;
  activeRequests: number;
  rank: number;
  errors: Record<string, number>;
}
