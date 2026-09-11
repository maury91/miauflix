import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, spyOn } from 'bun:test';

import { CatalogRuntime } from '../src/catalog/bootstrap';
import { CatalogConfigService } from '../src/config/config.service';
import { CatalogDatabase } from '../src/db/database';
import { ListRepository } from '../src/db/list.repo';
import type { ServiceContext } from '../src/service-context';
import { CatalogWorkerManager } from '../src/workers/worker';

const setup = () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'catalog-lifecycle-'));
  const db = new CatalogDatabase(dataDir);
  const config = new CatalogConfigService(dataDir, { TMDB_API_ACCESS_TOKEN: 'test-token' });
  const context: ServiceContext = {
    env: {
      host: '127.0.0.1',
      port: 3001,
      dataDir,
      disableBackgroundTasks: true,
      bunqueue: { host: '127.0.0.1', port: 6789 },
    },
    config,
    db,
    catalog: null,
  };
  return {
    db,
    config,
    context,
    runtime: new CatalogRuntime(context, config),
    cleanup: () => {
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
};

const runShutdown = async (event: 'SIGTERM' | 'uncaughtException') => {
  const dataDir = mkdtempSync(join(tmpdir(), 'catalog-shutdown-'));
  const sourceDir = join(import.meta.dir, '../src');
  // Isolate process handlers and exit codes. Replace only the external HTTP listener
  // and broker shutdown; the real entry point, runtime, configuration and SQLite run.
  const script = `
    import { CatalogDatabase } from ${JSON.stringify(join(sourceDir, 'db/database.ts'))};
    import { CatalogWorkerManager } from ${JSON.stringify(join(sourceDir, 'workers/worker.ts'))};
    const record = event => console.log('EVENT:' + event);
    Bun.serve = () => ({ stop: async () => {
      record('server-stop');
      await Promise.resolve();
      record('server-drained');
    } });
    CatalogWorkerManager.prototype.stop = async function () {
      record('workers-stop');
      await new Promise(resolve => setTimeout(resolve, 10));
      record('workers-drained');
    };
    const close = CatalogDatabase.prototype.close;
    CatalogDatabase.prototype.close = function () { record('database-close'); close.call(this); };
    await import(${JSON.stringify(join(sourceDir, 'index.ts'))});
    setTimeout(() => process.exit(0), 200);
    ${
      event === 'SIGTERM'
        ? "process.emit('SIGTERM'); process.emit('SIGTERM');"
        : "setTimeout(() => { throw new Error('intentional lifecycle failure'); }, 0);"
    }
  `;
  try {
    const child = Bun.spawn([process.execPath, '--eval', script], {
      env: { CATALOG_DATA_DIR: dataDir, CATALOG_DISABLE_BACKGROUND_TASKS: 'true' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return {
      exitCode,
      stderr,
      events: stdout
        .split('\n')
        .filter(line => line.startsWith('EVENT:'))
        .map(line => line.slice(6)),
    };
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
};

describe('catalog lifecycle', () => {
  it('waits for worker shutdown before runtime stop resolves', async () => {
    const { runtime, cleanup } = setup();
    const gate = Promise.withResolvers<void>();
    let drained = false;
    const stop = spyOn(CatalogWorkerManager.prototype, 'stop').mockImplementation(async () => {
      await gate.promise;
      drained = true;
    });
    try {
      let stopped = false;
      const stopping = runtime.stop().then(() => {
        stopped = true;
      });
      await Promise.resolve();
      expect(stopped).toBe(false);
      gate.resolve();
      await stopping;
      expect(drained).toBe(true);
    } finally {
      gate.resolve();
      stop.mockRestore();
      cleanup();
    }
  });

  it('does not attach the catalog when a provider probe finishes after shutdown begins', async () => {
    const { db, config, context, runtime, cleanup } = setup();
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<Response>();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      started.resolve();
      return response.promise;
    }) as unknown as typeof fetch;
    let activation: Promise<boolean> | undefined;
    try {
      activation = config.reload();
      await started.promise;
      const stopping = runtime.stop();
      response.resolve(Response.json({ images: { secure_base_url: 'https://image.test/' } }));
      await activation;
      await stopping;

      expect(context.catalog).toBeNull();
      expect(new ListRepository(db).listDefinitions()).toEqual([]);
    } finally {
      response.resolve(Response.json({}));
      globalThis.fetch = originalFetch;
      cleanup();
    }
  });
});
