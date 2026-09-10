import { describe, expect, it, mock } from 'bun:test';

const installedSchedules: Array<{ scheduleId: string; every: number }> = [];
let workerCount = 0;
let schedulerGate: Promise<void> | undefined;

class FakeQueue {
  constructor(_name: string, _connection: unknown) {}

  async upsertJobScheduler(scheduleId: string, scheduler: { every: number }): Promise<void> {
    installedSchedules.push({ scheduleId, every: scheduler.every });
    await schedulerGate;
  }

  async removeJobScheduler(): Promise<void> {}

  close(): void {}
}

class FakeWorker {
  constructor(_queue: string, _handler: unknown, _options: unknown) {
    workerCount++;
  }

  on(): void {}

  async close(): Promise<void> {}
}

mock.module('bunqueue-client', () => ({ Queue: FakeQueue, Worker: FakeWorker }));

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  throw new Error('Timed out waiting for catalog schedules');
};

describe('CatalogWorkerManager', () => {
  it('keeps workers idempotent while refreshing persisted schedules on later starts', async () => {
    installedSchedules.length = 0;
    workerCount = 0;
    schedulerGate = undefined;
    const { CatalogWorkerManager } = await import('../src/workers/worker');
    let intervalS = 60;
    const manager = new CatalogWorkerManager(
      {
        host: '127.0.0.1',
        port: 3001,
        dataDir: '/tmp/catalog',
        disableBackgroundTasks: false,
        bunqueue: { host: '127.0.0.1', port: 6789 },
      },
      () => null,
      () => String(intervalS)
    );

    manager.start();
    await waitFor(() => installedSchedules.length === 3);
    expect(installedSchedules).toEqual(
      expect.arrayContaining([
        { scheduleId: 'catalog-movie-changes', every: 60_000 },
        { scheduleId: 'catalog-show-changes', every: 60_000 },
        { scheduleId: 'catalog-season-sync', every: 60_000 },
      ])
    );

    intervalS = 120;
    manager.start();
    await waitFor(() => installedSchedules.length === 6);

    expect(installedSchedules.slice(3)).toEqual([
      { scheduleId: 'catalog-movie-changes', every: 120_000 },
      { scheduleId: 'catalog-show-changes', every: 120_000 },
      { scheduleId: 'catalog-season-sync', every: 120_000 },
    ]);
    expect(workerCount).toBe(3);
    await manager.stop();
  });

  it('coalesces refresh requests that arrive while schedules are being installed', async () => {
    installedSchedules.length = 0;
    workerCount = 0;
    const gate = Promise.withResolvers<void>();
    schedulerGate = gate.promise;
    const { CatalogWorkerManager } = await import('../src/workers/worker');
    let intervalS = 60;
    const manager = new CatalogWorkerManager(
      {
        host: '127.0.0.1',
        port: 3001,
        dataDir: '/tmp/catalog',
        disableBackgroundTasks: false,
        bunqueue: { host: '127.0.0.1', port: 6789 },
      },
      () => null,
      () => String(intervalS)
    );

    manager.start();
    await waitFor(() => installedSchedules.length === 1);
    intervalS = 120;
    manager.start();
    manager.start();
    gate.resolve();

    await waitFor(() => installedSchedules.length === 6);
    expect(installedSchedules).toHaveLength(6);
    expect(installedSchedules.slice(-3)).toEqual([
      { scheduleId: 'catalog-movie-changes', every: 120_000 },
      { scheduleId: 'catalog-show-changes', every: 120_000 },
      { scheduleId: 'catalog-season-sync', every: 120_000 },
    ]);
    expect(workerCount).toBe(3);
    schedulerGate = undefined;
    await manager.stop();
  });
});
