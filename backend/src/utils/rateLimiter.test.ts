import { RateLimiter } from './rateLimiter';
import * as timeUtils from './time';

describe('RateLimiter', () => {
  let realDateNow: typeof Date.now;
  let currentTime: number;

  beforeEach(() => {
    // Setup time mocking for each test
    realDateNow = Date.now;
    currentTime = 1000;
    Date.now = jest.fn(() => currentTime);
  });

  afterEach(() => {
    // Cleanup after each test
    Date.now = realDateNow;
    jest.restoreAllMocks();
  });

  test('should not reject if under the limit', () => {
    const limiter = new RateLimiter(2);
    expect(limiter.shouldReject()).toBe(false); // First request
    expect(limiter.shouldReject()).toBe(false); // Second request (at limit)
    expect(limiter.shouldReject()).toBe(true); // Third request (over limit)
  });

  test('should reject if over the limit', () => {
    const limiter = new RateLimiter(1);
    expect(limiter.shouldReject()).toBe(false); // First request (at limit)
    expect(limiter.shouldReject()).toBe(true); // Second request (over limit)
  });

  test('should allow requests after interval', () => {
    const limiter = new RateLimiter(1);
    expect(limiter.shouldReject()).toBe(false); // First request

    // Advance time by 1100ms
    currentTime += 1100;

    expect(limiter.shouldReject()).toBe(false); // Should be allowed after interval
  });

  test('throttle should not wait for first request within limit', async () => {
    const sleepSpy = jest.spyOn(timeUtils, 'sleep').mockResolvedValue();
    const limiter = new RateLimiter(2);

    await limiter.throttle();

    expect(sleepSpy).not.toHaveBeenCalled();
  });

  test('throttle should wait when rate limit is exceeded', async () => {
    const sleepSpy = jest.spyOn(timeUtils, 'sleep').mockResolvedValue();
    const limiter = new RateLimiter(1);

    // First request - no waiting
    await limiter.throttle();
    expect(sleepSpy).not.toHaveBeenCalled();

    // Second request - should wait exactly 1000ms (one full interval)
    const throttlePromise = limiter.throttle();
    expect(sleepSpy).toHaveBeenCalled();
    expect(sleepSpy).toHaveBeenCalledWith(1000);

    await throttlePromise;
  });

  test('throttle should calculate proper delay for fractional rate limits', async () => {
    // Configure console.log mock to suppress output
    const consoleLogMock = jest.spyOn(console, 'log').mockImplementation(() => {});

    // Mock the sleep function so we don't actually wait
    const sleepSpy = jest.spyOn(timeUtils, 'sleep').mockResolvedValue();

    // Create a rate limiter with 0.2 requests per second (1 request every 5 seconds)
    const limiter = new RateLimiter(0.2);

    // =========== TIMELINE EXPLANATION ===========
    // t=0s:   First request (immediate)
    // t=0s:   Second request enters, waits until t=5s
    // t=2.5s: Third request enters, waits until t=10s
    // t=10.5s: Fourth request enters, waits until t=15s
    // ============================================

    // FIRST REQUEST at t=0s (currentTime = 1000ms)
    await limiter.throttle();
    // Should not wait for the first request
    expect(sleepSpy).not.toHaveBeenCalled();

    // SECOND REQUEST at t=0s (immediately after first)
    sleepSpy.mockClear();
    await limiter.throttle();

    // Should wait exactly 5000ms (one full interval)
    expect(sleepSpy).toHaveBeenCalledTimes(1);
    const firstSleepDelay = sleepSpy.mock.calls[0][0];
    expect(firstSleepDelay).toBe(5000);

    // THIRD REQUEST at t=2.5s
    sleepSpy.mockClear();

    // Advance clock to t=2.5s
    currentTime += 2500; // Now at 3500ms (2.5s after start)

    await limiter.throttle();
    expect(sleepSpy).toHaveBeenCalledTimes(1);

    // Calculate expected delay:
    // - First request was at t=0s
    // - Second request was scheduled to complete at t=5s (after waiting 5s)
    // - Third request must wait until t=10s (full interval after second request)
    // - Since current time is t=2.5s, wait time should be 7.5s
    const secondSleepDelay = sleepSpy.mock.calls[0][0];
    expect(secondSleepDelay).toBe(7500);

    // FOURTH REQUEST at t=10.5s
    sleepSpy.mockClear();

    // Advance clock to t=10.5s
    currentTime += 8000; // 3500 + 8000 = 11500ms (10.5s after start)

    await limiter.throttle();
    expect(sleepSpy).toHaveBeenCalledTimes(1);

    // Calculate expected delay:
    // - Third request was scheduled to complete at t=10s (after waiting 7.5s)
    // - Fourth request must wait until t=15s (full interval after third request)
    // - Since current time is t=10.5s, wait time should be 4.5s
    const thirdSleepDelay = sleepSpy.mock.calls[0][0];
    expect(thirdSleepDelay).toBe(4500);

    // Clean up
    consoleLogMock.mockRestore();
  });

  test('throttle should not wait when enough time has passed', async () => {
    const sleepSpy = jest.spyOn(timeUtils, 'sleep').mockResolvedValue();
    const limiter = new RateLimiter(1);

    // First request - no waiting
    await limiter.throttle();
    expect(sleepSpy).not.toHaveBeenCalled();

    // Advance time past the rate limit interval
    currentTime += 1100;

    // Second request after interval - no waiting needed
    await limiter.throttle();
    expect(sleepSpy).not.toHaveBeenCalled();
  });

  test('throttle should handle multiple requests correctly', async () => {
    const sleepSpy = jest.spyOn(timeUtils, 'sleep').mockResolvedValue();
    const limiter = new RateLimiter(2); // 2 requests per second

    // First two requests - no waiting
    await limiter.throttle();
    await limiter.throttle();
    expect(sleepSpy).not.toHaveBeenCalled();

    // Third request - should wait exactly 1000ms
    await limiter.throttle();
    expect(sleepSpy).toHaveBeenCalledTimes(1);
    expect(sleepSpy.mock.calls[0][0]).toBe(1000);

    // Advance time half way through the interval
    currentTime += 500;
    sleepSpy.mockClear();

    // Fourth request - should wait exactly 500ms
    await limiter.throttle();
    expect(sleepSpy).toHaveBeenCalledTimes(1);
    expect(sleepSpy.mock.calls[0][0]).toBe(500);
  });

  test('shouldReject should handle fractional rate limits correctly', () => {
    const limiter = new RateLimiter(0.2); // One request every 5 seconds

    // First request at t=0s should not be rejected
    expect(limiter.shouldReject()).toBe(false);

    // Second request at t=0s should be rejected (since the first is still in the window)
    expect(limiter.shouldReject()).toBe(true);

    // Advance time to t=4.9s (just before the 5s window expires)
    currentTime += 4900;
    expect(limiter.shouldReject()).toBe(true);

    // Advance time to t=5.1s (just after the 5s window expires)
    currentTime += 200; // Now at 6100ms (5.1s from start)

    // Make a request at t=5.1s
    expect(limiter.shouldReject()).toBe(false);

    // Next request at t=5.1s should be rejected again
    expect(limiter.shouldReject()).toBe(true);
  });
});
