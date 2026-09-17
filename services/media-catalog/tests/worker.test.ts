import { describe, expect, it, mock } from 'bun:test';

let workerCount = 0;
let processors: Array<(_job: unknown) => Promise<void>> = [];

class FakeQueue {
  close(): void {}
}
class FakeWorker {
  constructor(_queue: string, handler: (_job: unknown) => Promise<void>) {
    workerCount++;
    processors.push(handler);
  }
  on(): void {}
  async close(): Promise<void> {}
}
mock.module('bunqueue-client', () => ({ Queue: FakeQueue, Worker: FakeWorker }));

describe('CatalogWorkerManager', () => {
  it('creates workers without installing schedules and skips jobs while unready', async () => {
    workerCount = 0;
    processors = [];
    const { CatalogWorkerManager } = await import('../src/workers/worker');
    let ready = true;
    const catalog = {
      syncMovies: mock(() => Promise.resolve()),
      syncTVShows: mock(() => Promise.resolve()),
      syncIncompleteSeasons: mock(() => Promise.resolve()),
    };
    const manager = new CatalogWorkerManager(
      {
        host: '127.0.0.1',
        port: 3001,
        dataDir: '/tmp/catalog',
        disableBackgroundTasks: false,
        bunqueue: { host: '127.0.0.1', port: 6789 },
      },
      () => (ready ? catalog : null) as never
    );
    manager.start();
    expect(workerCount).toBe(3);
    await processors[0]?.({ raw: { name: 'catalog.movie-changes.scan' } });
    expect(catalog.syncMovies).toHaveBeenCalledTimes(1);
    ready = false;
    await processors[0]?.({ raw: { name: 'catalog.movie-changes.scan' } });
    expect(catalog.syncMovies).toHaveBeenCalledTimes(1);
    await manager.stop();
  });
});
