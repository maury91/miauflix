import { join } from 'node:path';

import { defineService, type Service } from '@miauflix/contract';
import { sources } from '@miauflix/service-contracts';
import { z } from 'zod';

import { SourcesConfigService } from './config/config.service';
import { openDatabase } from './db/database';
import { Store } from './db/store';
import type { ResolveHost } from './http/destination';
import { type Fetch, HttpClient } from './http/http-client';
import { Planner } from './planner/planner';
import { AdminError, ProviderAdmin } from './providers/admin';
import { DefinitionIndex } from './providers/cardigann/definition-index';
import { DefinitionStore } from './providers/cardigann/definition-store';
import { parseSources } from './providers/cardigann/sources';
import { preloadProviders } from './providers/preload';
import { Registry } from './providers/registry';
import { RepositoryService } from './repositories/repository.service';
import { TorrentFileService } from './torrent-file/torrent-file.service';
import { createSeal } from './util/seal';
import { VpnGuard } from './vpn/vpn-guard';
const searchSchema = z
  .object({
    media: z.object({
      kind: z.enum(['movie', 'show']),
      tmdbId: z.number().int().positive(),
      imdbId: z
        .string()
        .regex(/^tt\d+$/)
        .nullable(),
      tvdbId: z.number().int().positive().nullable().optional(),
      title: z.string().trim().min(1).max(500),
      originalTitle: z.string().max(500).optional(),
      year: z.number().int().min(1800).max(3000).nullable().optional(),
      isAnime: z.boolean().optional(),
      releaseDate: z.string().nullable().optional(),
    }),
    season: z.number().int().nonnegative().optional(),
    episode: z.number().int().positive().optional(),
    airDate: z.string().nullable().optional(),
    purpose: z.enum(['interactive', 'background']),
    skipProviders: z.array(z.string().max(100)).max(1000).optional(),
  })
  .refine(r => r.media.kind === 'movie' || (r.season !== undefined && r.episode !== undefined));
const fileSchema = z.object({
  hash: z.string().regex(/^[0-9a-fA-F]{40}$|^[0-9a-fA-F]{64}$/),
  fileRef: z.string().max(16000).optional(),
});
export interface SourcesServiceOptions {
  dataDir: string;
  keyFile: string;
  encryptionKey?: string;
  fetch?: Fetch;
  resolveHost?: ResolveHost;
  /** Providers to install and enable at startup: `<definition id>@<source URL>` entries. */
  preloadProviders?: string;
  /** Use git for GitHub-hosted definitions (the service entrypoint turns this on). */
  useGit?: boolean;
  /** Where to clone a GitHub definitions repository from (tests point this at a local repo). */
  definitionsGitUrl?: (owner: string, repo: string) => string;
  now?: () => number;
}
export function createSourcesService(options: SourcesServiceOptions): {
  service: Service;
  stop: () => Promise<void>;
} {
  const db = openDatabase(options.dataDir),
    config = new SourcesConfigService(),
    codec = createSeal(options.keyFile, options.encryptionKey);
  const store = new Store(db, codec.seal, codec.open, options.now);
  if (options.preloadProviders) preloadProviders(store, options.preloadProviders);
  const http = new HttpClient(
    {
      timeout: () => config.number('SOURCES_REQUEST_TIMEOUT_MS') || 15000,
      flareSolverr: () => config.value('FLARESOLVERR_URL'),
    },
    options.fetch,
    options.now,
    options.resolveHost
  );
  const vpn = new VpnGuard(config, http, options.now),
    definitions = new DefinitionStore(
      store,
      http,
      () => parseSources(config.value('CARDIGANN_DEFINITION_SOURCES')).sources,
      options.now,
      {
        gitDir: options.useGit ? join(options.dataDir, 'definitions-git') : undefined,
        gitUrlFor: options.definitionsGitUrl,
      }
    ),
    index = new DefinitionIndex(store, definitions, options.now),
    registry = new Registry(store, config, http, definitions),
    planner = new Planner(store, registry, config, http, options.now),
    files = new TorrentFileService(http, codec.open, store, registry);
  const admin = new ProviderAdmin(store, registry, http, options.now),
    repositories = new RepositoryService(store, http, () => admin.changed(), options.now);
  const stopping = new AbortController();
  const pending = new Set<Promise<unknown>>();
  const track = <T>(run: () => T | Promise<T>): Promise<T> => {
    stopping.signal.throwIfAborted();
    const task = Promise.resolve().then(run);
    pending.add(task);
    return task.finally(() => pending.delete(task));
  };
  config.registerProber({
    test: async values => ({
      success: true,
      message: (await vpn.isProtected(undefined, values))
        ? 'VPN protected or check disabled'
        : 'VPN unprotected; searches will be blocked',
    }),
  });
  const timer = setInterval(() => {
    store.prune();
    void track(() => repositories.refreshStale(stopping.signal)).catch(() => undefined);
  }, 3600_000);
  timer.unref();
  const syncInterval = () => Math.max(1, config.number('CARDIGANN_SYNC_INTERVAL_MINUTES') || 60);
  const startSync = async (): Promise<void> => {
    try {
      stopping.signal.throwIfAborted();
      const syncing = index.sync(stopping.signal);
      await track(async () => {
        const change = await syncing;
        if (change.added || change.updated || change.removed) admin.changed();
      });
    } catch {
      // Sync failures are reported by the index; cancellation is expected during shutdown.
    }
  };
  // Checked often so the first sync starts soon after the service is configured and a changed
  // interval applies at once; a run only starts when one is due.
  const syncTimer = setInterval(() => {
    if (config.ready && index.due(syncInterval())) void startSync();
  }, 5_000);
  syncTimer.unref();
  const guarded = async <T>(ctx: { fail: unknown }, run: () => T | Promise<T>): Promise<T> => {
    try {
      return await track(run);
    } catch (error) {
      if (error instanceof AdminError)
        return (ctx.fail as (code: string, message: string) => never)(error.code, error.message);
      throw error;
    }
  };
  const service = defineService({
    info: {
      id: 'sources',
      name: 'Sources',
      description: 'Isolated source search',
      version: '0.1.0',
    },
    configuration: config,
    status: () => ({
      state: config.ready ? 'ready' : 'standby',
      missingConfiguration: config.missingVars(),
      details: { vpn: vpn.state, providers: store.providers().filter(p => p.enabled).length },
    }),
    onStop: async () => {
      stopping.abort();
      clearInterval(timer);
      clearInterval(syncTimer);
      await Promise.allSettled(pending);
      db.close();
    },
  }).implement(sources, {
    search: async function* (request, ctx) {
      const signal = AbortSignal.any([ctx.signal, stopping.signal]);
      stopping.signal.throwIfAborted();
      if (!searchSchema.safeParse(request).success)
        return ctx.fail('bad_request', 'Invalid source search request');
      let resolve!: () => void;
      const task = new Promise<void>(r => {
        resolve = r;
      });
      pending.add(task);
      const iterator = planner.search(request, signal);
      const finish = () => {
        pending.delete(task);
        resolve();
      };
      // A consumer may be paused at a yield. Close the planner on stop even if it never resumes.
      const abort = () => {
        void iterator.return(undefined).then(finish, finish);
      };
      signal.addEventListener('abort', abort, { once: true });
      try {
        if (!(await vpn.isProtected(signal)))
          return ctx.fail('vpn_required', 'Sources require a protected connection');
        signal.throwIfAborted();
        yield* iterator;
      } finally {
        signal.removeEventListener('abort', abort);
        await iterator.return(undefined);
        finish();
      }
    },
    providers: () => admin.list(),
    updateProvider: ({ id, ...patch }, ctx) =>
      guarded(ctx, () =>
        admin.update(String(id), patch, AbortSignal.any([ctx.signal, stopping.signal]))
      ),
    reorderProviders: ({ ids }, ctx) =>
      guarded(ctx, () => {
        if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string'))
          throw new AdminError('bad_request', 'ids must be strings');
        return admin.reorder(ids);
      }),
    testProvider: ({ id }, ctx) =>
      guarded(ctx, () => admin.test(String(id), AbortSignal.any([ctx.signal, stopping.signal]))),
    repositories: () => repositories.list(),
    addRepository: ({ url }, ctx) =>
      guarded(ctx, () =>
        repositories.add(String(url), AbortSignal.any([ctx.signal, stopping.signal]))
      ),
    removeRepository: ({ id }, ctx) => guarded(ctx, () => repositories.remove(String(id))),
    refreshRepository: ({ id }, ctx) =>
      guarded(ctx, () =>
        repositories.refresh(String(id), AbortSignal.any([ctx.signal, stopping.signal]))
      ),
    providersChanged: emit => admin.subscribe(emit),
    cardigannDefinitions: (query, ctx) =>
      guarded(ctx, () => admin.catalog(query, index, syncInterval())),
    syncCardigannDefinitions: () => {
      void startSync();
      return { ...index.status(), intervalMinutes: syncInterval() };
    },
    addCardigannProvider: ({ id, source }, ctx) =>
      guarded(ctx, () =>
        admin.addCardigann(
          String(id),
          typeof source === 'string' ? source : undefined,
          AbortSignal.any([ctx.signal, stopping.signal])
        )
      ),
    addTorznabProvider: (input, ctx) => guarded(ctx, () => admin.addTorznab(input)),
    removeProvider: ({ id }, ctx) => guarded(ctx, () => admin.remove(String(id))),
    torrentFile: async (input, ctx) => {
      const parsed = fileSchema.safeParse(input);
      if (!parsed.success) return ctx.fail('bad_request', 'Invalid source file request');
      const { hash, fileRef } = parsed.data;
      return track(async () => {
        const signal = AbortSignal.any([ctx.signal, stopping.signal]);
        if (!(await vpn.isProtected(signal)))
          return ctx.fail('vpn_required', 'Sources require a protected connection');
        return files.resolve(hash, fileRef, signal);
      });
    },
  });
  return { service, stop: () => service.stop() };
}
