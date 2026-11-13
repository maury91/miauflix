import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, spyOn } from 'bun:test';

import { CatalogRuntime } from '../src/catalog/bootstrap';
import { CatalogService } from '../src/catalog/catalog.service';
import { CatalogConfigService } from '../src/config/config.service';
import { CatalogDatabase } from '../src/db/database';
import { MovieRepository } from '../src/db/movie.repo';
import type { ServiceContext } from '../src/service-context';
import { CatalogWorkerManager } from '../src/workers/worker';

const setup = () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'catalog-lifecycle-'));
  const db = new CatalogDatabase(dataDir);
  const config = new CatalogConfigService();
  const context: ServiceContext = {
    env: {
      host: '127.0.0.1',
      port: 3001,
      dataDir,
      disableBackgroundTasks: true,
      anime: { animeLists: '', aniZip: '' },
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
  it('starts warming English genres immediately after provider activation', async () => {
    const { config, context, runtime, cleanup } = setup();
    const originalFetch = globalThis.fetch;
    const paths: string[] = [];
    const hydrationRequests = Promise.withResolvers<void>();
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const path = String(input);
      paths.push(path);
      if (
        paths.some(request => request.endsWith('/configuration')) &&
        paths.some(request => request.endsWith('/genre/movie/list?language=en')) &&
        paths.some(request => request.endsWith('/genre/tv/list?language=en'))
      ) {
        hydrationRequests.resolve();
      }
      if (path.endsWith('/configuration')) {
        return Response.json({ images: { secure_base_url: 'https://image.test/' } });
      }
      return Response.json({ genres: [] });
    }) as unknown as typeof fetch;
    try {
      const result = await config.applyRemote({
        TMDB_API_URL: 'https://api.themoviedb.org/3',
        TMDB_API_ACCESS_TOKEN: 'test-token',
        EPISODE_SYNC_MODE: 'ON_DEMAND',
        CATALOG_HYDRATION_TTL_MS: '86400000',
      });
      expect(result.success).toBe(true);
      await hydrationRequests.promise;

      expect(paths).toContain('https://api.themoviedb.org/3/genre/movie/list?language=en');
      expect(paths).toContain('https://api.themoviedb.org/3/genre/tv/list?language=en');
      expect(context.catalog).not.toBeNull();
    } finally {
      await runtime.stop();
      globalThis.fetch = originalFetch;
      cleanup();
    }
  });

  it('keeps a single active catalog across reactivations, even concurrent ones', async () => {
    const { config, context, runtime, cleanup } = setup();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (new Headers(init?.headers).get('authorization')?.includes('rejected-token'))
        return new Response('{}', { status: 401 });
      if (String(input).endsWith('/configuration'))
        return Response.json({ images: { secure_base_url: 'https://image.test/' } });
      return Response.json({ genres: [] });
    }) as unknown as typeof fetch;
    const created = new Set<CatalogService>();
    const retired = new Set<CatalogService>();
    const genres = spyOn(CatalogService.prototype, 'getGenres').mockImplementation(function (
      this: CatalogService
    ) {
      created.add(this);
      return Promise.resolve([]);
    });
    const stopArtwork = spyOn(CatalogService.prototype, 'stopArtworkBackground').mockImplementation(
      async function (this: CatalogService) {
        retired.add(this);
      }
    );
    const values = (token: string) => ({
      TMDB_API_URL: 'https://api.themoviedb.org/3',
      TMDB_API_ACCESS_TOKEN: token,
      EPISODE_SYNC_MODE: 'ON_DEMAND',
      CATALOG_HYDRATION_TTL_MS: '86400000',
    });
    try {
      // The backend pushes its configuration on every reconnect
      expect((await config.applyRemote(values('test-token'))).success).toBe(true);
      const first = context.catalog;
      expect((await config.applyRemote(values('test-token'))).success).toBe(true);
      expect(context.catalog).not.toBe(first);
      expect(retired.has(first!)).toBe(true);

      // Even callers that skip the configuration's own queue cannot overlap activations
      const prober = (
        runtime as unknown as {
          prober: { activate(values: Record<string, string>): Promise<{ success: boolean }> };
        }
      ).prober;
      const results = await Promise.all([1, 2, 3].map(() => prober.activate(values('test-token'))));
      expect(results.every(result => result.success)).toBe(true);
      expect(created.size).toBe(5);
      const running = [...created].filter(catalog => !retired.has(catalog));
      expect(running).toEqual([context.catalog!]);

      // A rejected configuration leaves the active instance serving
      const active = context.catalog;
      expect((await config.applyRemote(values('rejected-token'))).success).toBe(false);
      expect(context.catalog).toBe(active);
      expect(retired.has(active!)).toBe(false);

      // Testing a configuration never creates an instance
      await config.test(values('test-token'));
      expect(created.size).toBe(5);
    } finally {
      await runtime.stop();
      genres.mockRestore();
      stopArtwork.mockRestore();
      globalThis.fetch = originalFetch;
      cleanup();
    }
  });

  it('keeps artwork subscriptions delivering across reactivation', async () => {
    const { config, context, db, runtime, cleanup } = setup();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) =>
      String(input).endsWith('/configuration')
        ? Response.json({ images: { secure_base_url: 'https://image.tmdb.org/t/p/' } })
        : Response.json({ genres: [] })) as unknown as typeof fetch;
    const values = {
      TMDB_API_URL: 'https://api.themoviedb.org/3',
      TMDB_API_ACCESS_TOKEN: 'test-token',
      EPISODE_SYNC_MODE: 'ON_DEMAND',
      CATALOG_HYDRATION_TTL_MS: '86400000',
    };
    const movie = (mediaId: number, logo: string) => ({
      mediaId,
      imdbId: null,
      title: `Movie ${mediaId}`,
      overview: '',
      tagline: '',
      releaseDate: '',
      runtime: 0,
      poster: '',
      backdrop: `https://image.tmdb.org/t/p/original/backdrop-${mediaId}.jpg`,
      logo,
      logoCandidates: [
        { url: logo, language: 'en', width: 300, height: 100, voteAverage: 0, voteCount: 0 },
      ],
      genreIds: [],
      popularity: 1,
      rating: 0,
      translations: [],
    });
    const movies = new MovieRepository(db);
    movies.upsertMovie(movie(1, 'https://image.tmdb.org/t/p/original/logo-1.png'));
    movies.upsertMovie(movie(2, 'https://image.tmdb.org/t/p/original/logo-2.png'));
    try {
      expect((await config.applyRemote(values)).success).toBe(true);
      // The host subscribes while the service is ready, on the instance active then
      const received: number[] = [];
      const unsubscribe = context.catalog!.onArtworkUpdate(update => received.push(update.mediaId));

      // A configuration push replaces the instance without the service leaving `ready`
      const first = context.catalog;
      expect((await config.applyRemote(values)).success).toBe(true);
      expect(context.catalog).not.toBe(first);

      context.catalog!.queueArtwork([{ mediaType: 'movie', mediaId: 1 }], 'focused');
      expect(received).toEqual([1]);

      unsubscribe();
      context.catalog!.queueArtwork([{ mediaType: 'movie', mediaId: 2 }], 'focused');
      expect(received).toEqual([1]);
    } finally {
      await runtime.stop();
      globalThis.fetch = originalFetch;
      cleanup();
    }
  });

  it('never leaves queue workers without a catalog while replacing or deactivating it', async () => {
    const { config, context, runtime, cleanup } = setup();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) =>
      String(input).endsWith('/configuration')
        ? Response.json({ images: { secure_base_url: 'https://image.test/' } })
        : Response.json({ genres: [] })) as unknown as typeof fetch;
    const values = {
      TMDB_API_URL: 'https://api.themoviedb.org/3',
      TMDB_API_ACCESS_TOKEN: 'test-token',
      EPISODE_SYNC_MODE: 'ON_DEMAND',
      CATALOG_HYDRATION_TTL_MS: '86400000',
    };
    const retiring = Promise.withResolvers<void>();
    const retireCalled = Promise.withResolvers<void>();
    let holdRetirement = false;
    const original = CatalogService.prototype.stopArtworkBackground;
    const stopArtwork = spyOn(CatalogService.prototype, 'stopArtworkBackground').mockImplementation(
      async function (this: CatalogService) {
        const stopping = original.call(this);
        if (holdRetirement) {
          retireCalled.resolve();
          await retiring.promise;
        }
        await stopping;
      }
    );
    // What a queue worker sees when it picks up a job: `() => ctx.catalog`
    const jobCatalog = () => context.catalog;
    const catalogsSeenByPause: unknown[] = [];
    const pause = spyOn(CatalogWorkerManager.prototype, 'pause').mockImplementation(async () => {
      catalogsSeenByPause.push(jobCatalog());
    });
    try {
      expect((await config.applyRemote(values)).success).toBe(true);
      const first = jobCatalog();

      holdRetirement = true;
      const replacing = config.applyRemote(values);
      await retireCalled.promise;
      // The old instance's shutdown is still pending: a job dispatched now gets the replacement
      const during = jobCatalog();
      expect(during).not.toBeNull();
      expect(during).not.toBe(first);
      retiring.resolve();
      expect((await replacing).success).toBe(true);
      expect(jobCatalog()).toBe(during);

      // Deactivation drains the workers before detaching the catalog
      holdRetirement = false;
      await config.clearRemote();
      expect(catalogsSeenByPause).toEqual([during]);
      expect(jobCatalog()).toBeNull();
    } finally {
      retiring.resolve();
      await runtime.stop();
      stopArtwork.mockRestore();
      pause.mockRestore();
      globalThis.fetch = originalFetch;
      cleanup();
    }
  });

  it('reports a replacement as active even when the replaced instance fails to shut down', async () => {
    const { config, context, runtime, cleanup } = setup();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) =>
      String(input).endsWith('/configuration')
        ? Response.json({ images: { secure_base_url: 'https://image.test/' } })
        : Response.json({ genres: [] })) as unknown as typeof fetch;
    const values = {
      TMDB_API_URL: 'https://api.themoviedb.org/3',
      TMDB_API_ACCESS_TOKEN: 'test-token',
      EPISODE_SYNC_MODE: 'ON_DEMAND',
      CATALOG_HYDRATION_TTL_MS: '86400000',
    };
    const created: CatalogService[] = [];
    const genres = spyOn(CatalogService.prototype, 'getGenres').mockImplementation(function (
      this: CatalogService
    ) {
      created.push(this);
      return Promise.resolve([]);
    });
    const stopArtwork = spyOn(CatalogService.prototype, 'stopArtworkBackground').mockRejectedValue(
      new Error('worker refused to terminate')
    );
    try {
      expect((await config.applyRemote(values)).success).toBe(true);
      const result = await config.applyRemote({ ...values, CATALOG_HYDRATION_TTL_MS: '3600000' });

      expect(result.success).toBe(true);
      expect(config.state).toBe('ready');
      expect(config.values.CATALOG_HYDRATION_TTL_MS).toBe('3600000');
      // No re-activation with the previous values: the replacement is what serves
      expect(created).toHaveLength(2);
      expect(context.catalog).toBe(created[1]!);
    } finally {
      stopArtwork.mockRestore();
      await runtime.stop();
      genres.mockRestore();
      globalThis.fetch = originalFetch;
      cleanup();
    }
  });

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
    const { config, context, runtime, cleanup } = setup();
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<Response>();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      started.resolve();
      return response.promise;
    }) as unknown as typeof fetch;
    let activation: Promise<boolean> | undefined;
    try {
      activation = config
        .applyRemote({
          TMDB_API_URL: 'https://api.themoviedb.org/3',
          TMDB_API_ACCESS_TOKEN: 'test-token',
          EPISODE_SYNC_MODE: 'ON_DEMAND',
          CATALOG_HYDRATION_TTL_MS: '86400000',
        })
        .then(result => result.success);
      await started.promise;
      const stopping = runtime.stop();
      response.resolve(Response.json({ images: { secure_base_url: 'https://image.test/' } }));
      await activation;
      await stopping;

      expect(context.catalog).toBeNull();
    } finally {
      response.resolve(Response.json({}));
      globalThis.fetch = originalFetch;
      cleanup();
    }
  });
});
