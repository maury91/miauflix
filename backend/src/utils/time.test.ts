import { sleep } from './time';

describe('sleep', () => {
  it('resolves after the specified time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45); // allow some margin
  });
});
