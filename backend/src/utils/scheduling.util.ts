const ONE_HOUR = 60 * 60 * 1000;

/**
 * Calculate percentage change between old and new values
 */
export const calculateSourceStatsVolatility = (
  previousCount: number,
  currentCount: number
): number => {
  return previousCount === 0
    ? currentCount > 0
      ? 100
      : 0
    : Math.abs((currentCount - previousCount) / previousCount) * 100;
};

/**
 * Calculate the next stats check interval using exponential backoff based on volatility
 */
export const calculateBackoffInterval = (
  currentIntervalMs: number | undefined,
  volatilityPercent: number,
  minIntervalMs: number = 6 * ONE_HOUR,
  maxIntervalMs: number = 72 * ONE_HOUR
): number => {
  let nextInterval = currentIntervalMs ?? minIntervalMs;

  if (volatilityPercent < 5) {
    // Very small change - increase backoff (double it, but cap at max)
    nextInterval = Math.min(nextInterval * 2, maxIntervalMs);
  } else if (volatilityPercent < 10) {
    // Small change - keep constant
  } else if (volatilityPercent > 50) {
    // Huge change - reset to minimum
    nextInterval = minIntervalMs;
  } else if (volatilityPercent > 20) {
    // Considerable change - reduce backoff
    nextInterval = Math.max(nextInterval / 2, minIntervalMs);
  } else {
    // 10-20% change - slight reduction
    nextInterval = Math.max(nextInterval * 0.75, minIntervalMs);
  }

  // Add randomness (±20% of the interval)
  const randomFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
  nextInterval *= randomFactor;

  // Ensure bounds
  return Math.max(minIntervalMs, Math.min(nextInterval, maxIntervalMs));
};

/**
 * Schedule the next check based on the last interval and the changed values
 * @param lastIntervalMs The last interval in milliseconds
 * @param changedValues The changed values
 * @returns The next check time
 */
export const scheduleNextCheck = (
  lastIntervalMs: number | undefined,
  ...changedValues: { old: number; new: number }[]
): Date => {
  const change = Math.max(
    ...changedValues.map(({ old, new: newVal }) => calculateSourceStatsVolatility(old, newVal))
  );
  const nextIntervalMs = calculateBackoffInterval(lastIntervalMs, change);
  return new Date(Date.now() + nextIntervalMs);
};
