jest.mock('@logger', () => ({
  logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { ServiceScheduleCoordinator } from './service-schedule.coordinator';

const setupTest = (ready: boolean, enabled = true) => {
  const jobs = {
    connect: jest.fn().mockResolvedValue(undefined),
    schedule: jest.fn().mockResolvedValue(undefined),
    removeSchedule: jest.fn().mockResolvedValue(undefined),
    removeSchedulesByPrefix: jest.fn().mockResolvedValue(undefined),
    removeScheduleByQueue: jest.fn().mockResolvedValue(undefined),
  };
  const values: Record<string, number> = {
    MOVIE_SOURCE_SEARCH_INTERVAL: 5,
    SOURCE_METADATA_SEARCH_INTERVAL: 1,
    SOURCE_STATS_INTERVAL: 30,
    CACHE_CLEANUP_INTERVAL: 21600,
    REFRESH_LISTS_INTERVAL: 3600,
    CATALOG__CATALOG_MOVIE_SYNC_INTERVAL: 5400,
    CATALOG__CATALOG_SHOW_SYNC_INTERVAL: 5400,
    CATALOG__CATALOG_SEASON_SYNC_INTERVAL: 5,
  };
  const config = { getOrThrow: jest.fn((key: string) => values[key]) };
  const catalog = {
    isReady: jest.fn(() => ready),
    subscribeStatus: jest.fn().mockReturnValue(jest.fn()),
  };
  const lists = { getLists: jest.fn().mockResolvedValue([{ slug: 'popular' }]) };
  const coordinator = new ServiceScheduleCoordinator(
    jobs as never,
    config as never,
    catalog as never,
    lists as never
  );
  coordinator.start(enabled);
  return { coordinator, jobs };
};

describe('ServiceScheduleCoordinator', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('installs the enabled schedule set when the catalog is ready', async () => {
    const { coordinator, jobs } = setupTest(true);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(jobs.schedule).toHaveBeenCalledTimes(8);
    expect(jobs.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'source.discover', intervalSeconds: 5, runOnStart: true })
    );
    expect(jobs.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'cache.cleanup', intervalSeconds: 21600, runOnStart: false })
    );
    await coordinator.stop();
  });

  it('removes all persisted schedules when background work is disabled', async () => {
    const { coordinator, jobs } = setupTest(false, false);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(jobs.schedule).not.toHaveBeenCalled();
    expect(jobs.removeSchedule).toHaveBeenCalledTimes(7);
    expect(jobs.removeSchedulesByPrefix).toHaveBeenCalledWith('miauflix-list-refresh', 'refresh-');
    expect(jobs.removeScheduleByQueue).toHaveBeenCalledTimes(3);
    await coordinator.stop();
  });

  it('retries a broker failure without creating duplicate retry timers', async () => {
    jest.useFakeTimers();
    const { coordinator, jobs } = setupTest(false);
    jobs.connect
      .mockReset()
      .mockRejectedValueOnce(new Error('broker down'))
      .mockResolvedValue(undefined);

    await Promise.resolve();
    await Promise.resolve();
    expect(jobs.connect).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(15_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(jobs.connect).toHaveBeenCalledTimes(2);
    await coordinator.stop();
  });
});
