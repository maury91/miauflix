import { SourceHealthService } from './source-health.service';

describe('SourceHealthService', () => {
  it('avoids a failed source for its memory period and announces each failure once', () => {
    const health = new SourceHealthService(1_000);
    const listener = jest.fn();
    health.onFailed(listener);

    health.markFailed(7, 10_000);
    health.markFailed(7, 10_500);
    expect(health.hasFailed(7, 10_999)).toBe(true);
    expect(health.hasFailed(8, 10_999)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    // The repeat stall extended the memory; once it lapses the source is tried again.
    expect(health.hasFailed(7, 11_499)).toBe(true);
    expect(health.hasFailed(7, 11_500)).toBe(false);
    health.markFailed(7, 12_000);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
