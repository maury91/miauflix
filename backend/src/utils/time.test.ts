import { sleep } from './time';

describe('sleep', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves after the specified time', async () => {
    const start = Date.now();
    const promise = sleep(50);
    jest.advanceTimersByTime(50);
    await promise;
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });
});
