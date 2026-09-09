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

  it('spaces initial task executions by three seconds', async () => {
    const { scheduler } = setupTest();
    const firstTask = jest.fn().mockResolvedValue(undefined);
    const secondTask = jest.fn().mockResolvedValue(undefined);

    scheduler.scheduleTask('sourceSearch', 10, firstTask);
    scheduler.scheduleTask('sourceMetadata', 10, secondTask);

    await jest.advanceTimersByTimeAsync(0);
    expect(firstTask).toHaveBeenCalledTimes(1);
    expect(secondTask).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2_999);
    expect(secondTask).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(secondTask).toHaveBeenCalledTimes(1);
    scheduler.cancelTask('sourceSearch');
    scheduler.cancelTask('sourceMetadata');
  });

  it('runs a queued task immediately when its dependency recovers', async () => {
    const { scheduler } = setupTest();
    const task = jest.fn().mockResolvedValue(undefined);

    scheduler.scheduleTask('firstTask', 3600, jest.fn().mockResolvedValue(undefined));
    scheduler.scheduleTask('refreshLists', 3600, task, ['TMDB']);
    scheduler.notifyServicesRecovered([{ service: 'TMDB', previousStatus: 'degraded' }]);
    await Promise.resolve();

    expect(task).toHaveBeenCalledTimes(1);
    scheduler.cancelTask('refreshLists');
  });
});
