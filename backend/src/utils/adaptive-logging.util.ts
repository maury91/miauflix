import { logger } from '@logger';

/**
 * Utility functions for adaptive logging with exponential backoff
 */

export interface LogEventResult {
  shouldLog: boolean;
  nextInterval: number;
}

interface AdaptiveLogState {
  lastLogTime: number;
  logInterval: number;
}

// Internal state management for adaptive logging
const logStates = new Map<string, AdaptiveLogState>();

/**
 * Calculate progressive delay for exponential backoff
 */
export const calculateProgressiveDelay = (
  currentDelayMs: number,
  backoffMultiplier: number = 2,
  maxDelayMs: number = 600000
): number => {
  return Math.min(currentDelayMs * backoffMultiplier, maxDelayMs);
};

/**
 * Determine if an event should be logged based on exponential backoff
 */
export const shouldLogEvent = (lastLogTime: number, currentLogInterval: number): LogEventResult => {
  const now = Date.now();
  const timeSinceLastLog = now - lastLogTime;

  if (timeSinceLastLog > currentLogInterval) {
    const nextInterval = calculateProgressiveDelay(currentLogInterval);
    return { shouldLog: true, nextInterval };
  }

  return { shouldLog: false, nextInterval: currentLogInterval };
};

/**
 * Adaptive logging with automatic exponential backoff
 * Logs a message only when enough time has passed, with increasing intervals between logs
 *
 * @param serviceName Name of the service (e.g., 'SourceService')
 * @param message Message to log
 * @param identifier Optional identifier for separate backoff timers (defaults to serviceName:message)
 */
export const adaptiveLog = (serviceName: string, message: string, identifier?: string): void => {
  // Generate unique identifier for this log event
  const logId = identifier || `${serviceName}:${message}`;

  // Get or create state for this log event
  let state = logStates.get(logId);
  if (!state) {
    state = {
      lastLogTime: 0,
      logInterval: 30000, // Start with 30 seconds
    };
    logStates.set(logId, state);
  }

  // Check if we should log this event
  const logEvent = shouldLogEvent(state.lastLogTime, state.logInterval);

  if (logEvent.shouldLog) {
    logger.debug(serviceName, message);
    state.lastLogTime = Date.now();
    state.logInterval = logEvent.nextInterval;
  }
};
