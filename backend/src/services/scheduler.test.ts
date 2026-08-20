jest.mock('@logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

import { logger } from '@logger';

import { Scheduler } from './scheduler';

const setupTest = () => {
  const scheduler = new Scheduler({
    getOrThrow: jest.fn().mockReturnValue('/tmp/traces'),
  } as never);
  return { scheduler };
};

describe('Scheduler service recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs dependent tasks immediately when a service recovers', async () => {
    const { scheduler } = setupTest();
    const task = jest.fn().mockResolvedValue(undefined);
    scheduler.scheduleTask('refreshLists', 3600, task, ['TMDB']);
    await Promise.resolve();
    task.mockClear();

    scheduler.notifyServicesRecovered([{ service: 'TMDB', previousStatus: 'degraded' }]);
    await Promise.resolve();

    expect(task).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      'Scheduler',
      'TMDB recovered (degraded → ready); triggering dependent tasks: refreshLists'
    );
    scheduler.cancelTask('refreshLists');
  });

  it('does not run unrelated tasks when a service recovers', async () => {
    const { scheduler } = setupTest();
    const task = jest.fn().mockResolvedValue(undefined);
    scheduler.scheduleTask('cacheCleanup', 3600, task, ['STORAGE']);
    await Promise.resolve();
    task.mockClear();

    scheduler.notifyServicesRecovered([{ service: 'TMDB', previousStatus: 'error' }]);
    await Promise.resolve();

    expect(task).not.toHaveBeenCalled();
    scheduler.cancelTask('cacheCleanup');
  });
});
