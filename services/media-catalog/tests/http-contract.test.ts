import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SERVICE_MANIFEST_PATH,
  serviceErrorSchema,
  serviceManifestSchema,
} from '@miauflix/service-contracts';
import { afterEach, describe, expect, it } from 'bun:test';

import { CatalogConfigService } from '../src/config/config.service';
import { createArtworkEventsTransport } from '../src/http/artwork-events';
import { registerConfigurationRoutes } from '../src/http/handlers/configuration';
import { registerMediaRoutes } from '../src/http/handlers/media';
import { registerSystemRoutes } from '../src/http/handlers/system';
import { Router } from '../src/http/router';
import type { ServiceContext } from '../src/service-context';

const directories: string[] = [];

const setupTest = () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'catalog-http-contract-'));
  directories.push(dataDir);
  const config = new CatalogConfigService();
  const db = {
    db: {
      select: () => ({
        from: () => ({
          get: () => ({ total: 0 }),
          all: () => [],
        }),
      }),
    },
  };
  const context = { config, db, catalog: null, env: {} } as unknown as ServiceContext;
  const router = new Router();
  registerSystemRoutes(router, context);
  registerConfigurationRoutes(router, context);
  return router;
};

const setupReadyMediaRouter = () => {
  const router = new Router();
  const artworkListeners = new Set<(update: Record<string, unknown>) => void>();
  const context = {
    config: { state: 'ready' },
    catalog: {
      getMovie: async (mediaId: number) => ({
        mediaType: 'movie' as const,
        mediaId,
        imdbId: null,
        title: 'Movie',
        overview: '',
        tagline: '',
        releaseDate: '',
        runtime: 0,
        poster: '',
        backdrop: '',
        logo: '',
        genres: [],
        popularity: 0,
        rating: 0,
        detailsSyncedAt: null,
      }),
      artworkSnapshot: () => [
        {
          mediaType: 'movie' as const,
          mediaId: 42,
          backdrop: 'backdrop.jpg',
          logo: 'card.png',
          heroLogo: 'hero.png',
          artworkRevision: 3,
          cardLogoStatus: 'ready' as const,
          heroLogoStatus: 'ready' as const,
        },
      ],
      queueArtwork: () => 1,
      search: async (query: string, page: number) => ({
        page,
        totalPages: 1,
        totalResults: 1,
        results: [
          {
            mediaType: 'movie' as const,
            mediaId: 7,
            title: query,
            overview: '',
            poster: '',
            backdrop: '',
            genreIds: [],
            releaseDate: '',
            popularity: 1,
            rating: 1,
          },
        ],
      }),
      discover: async (filter: unknown, page: number) => ({
        page,
        totalPages: 0,
        totalResults: 0,
        results: [],
        filter,
      }),
      onArtworkUpdate: (listener: (update: Record<string, unknown>) => void) => {
        artworkListeners.add(listener);
        return () => artworkListeners.delete(listener);
      },
      publishArtwork: (update: Record<string, unknown>) => {
        for (const listener of artworkListeners) listener(update);
      },
    },
  } as unknown as ServiceContext;
  registerMediaRoutes(router, context);
  return Object.assign(router, {
    context,
    artworkListeners,
    publishArtwork: (update: Record<string, unknown>) => {
      for (const listener of artworkListeners) listener(update);
    },
  });
};

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('media-catalog management contract', () => {
  it('publishes a runtime-valid discovery manifest', async () => {
    const response = await setupTest().handle(
      new Request(`http://catalog${SERVICE_MANIFEST_PATH}`)
    );
    expect(response.status).toBe(200);
    expect(serviceManifestSchema.parse(await response.json()).capabilities.catalog).toEqual({
      version: 1,
      basePath: '/v1/catalog',
    });
  });

  it('returns the shared error envelope for malformed configuration writes', async () => {
    const response = await setupTest().handle(
      new Request('http://catalog/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [] }),
      })
    );
    expect(response.status).toBe(400);
    expect(serviceErrorSchema.parse(await response.json()).code).toBe('invalid_contract_payload');
  });

  it('rejects route parameters that only begin with a valid media ID', async () => {
    const response = await setupReadyMediaRouter().handle(
      new Request('http://catalog/v1/catalog/movie/7junk')
    );

    expect(response.status).toBe(400);
    expect(serviceErrorSchema.parse(await response.json()).code).toBe('invalid_request');
  });

  it('searches by query and discovers by a known genre key', async () => {
    const router = setupReadyMediaRouter();

    const search = await router.handle(
      new Request('http://catalog/v1/catalog/search?query=%20Dune%20&page=2')
    );
    expect(search.status).toBe(200);
    expect(await search.json()).toMatchObject({ page: 2, results: [{ title: 'Dune' }] });

    const discover = await router.handle(
      new Request('http://catalog/v1/catalog/discover?genre=anime')
    );
    expect(discover.status).toBe(200);
    expect(await discover.json()).toEqual({ page: 1, totalPages: 0, totalResults: 0, results: [] });

    const blank = await router.handle(new Request('http://catalog/v1/catalog/search?query=%20'));
    expect(blank.status).toBe(400);
    const unknownGenre = await router.handle(
      new Request('http://catalog/v1/catalog/discover?genre=western')
    );
    expect(unknownGenre.status).toBe(400);
  });

  it('returns a cache-only artwork snapshot and accepts a bounded priority queue request', async () => {
    const router = setupReadyMediaRouter();
    const snapshot = await router.handle(
      new Request('http://catalog/v1/catalog/media/artwork/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ mediaType: 'movie', mediaId: 42 }] }),
      })
    );
    expect(snapshot.status).toBe(200);
    expect(await snapshot.json()).toMatchObject({
      updates: [{ mediaId: 42, artworkRevision: 3, logo: 'card.png', heroLogo: 'hero.png' }],
    });

    const queued = await router.handle(
      new Request('http://catalog/v1/catalog/media/artwork/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ mediaType: 'tv', mediaId: 7 }],
          priority: 'focused',
        }),
      })
    );
    expect(queued.status).toBe(200);
    expect(await queued.json()).toEqual({ accepted: 1 });
  });

  it('sends artwork over WebSocket and releases the subscription on disconnect', async () => {
    const router = setupReadyMediaRouter();
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      ...createArtworkEventsTransport(router.context, router),
    });
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/v1/catalog/media/artwork/events`);
    try {
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = reject;
      });
      const message = new Promise<unknown>(resolve => {
        socket.onmessage = event => resolve(JSON.parse(String(event.data)));
      });
      const update = {
        mediaType: 'tv',
        mediaId: 7,
        backdrop: 'backdrop.jpg',
        logo: 'card.png',
        heroLogo: 'hero.png',
        artworkRevision: 1,
        cardLogoStatus: 'ready',
        heroLogoStatus: 'ready',
      };
      router.publishArtwork(update);
      expect(await message).toEqual(update);
      const closed = new Promise<void>(resolve => {
        socket.onclose = () => resolve();
      });
      socket.close();
      await closed;
      for (let attempt = 0; router.artworkListeners.size && attempt < 100; attempt++) {
        await Bun.sleep(10);
      }
      expect(router.artworkListeners.size).toBe(0);
    } finally {
      socket.close();
      await server.stop(true);
    }
  });

  it('requires a WebSocket upgrade and rejects feeds while unconfigured', async () => {
    const router = setupReadyMediaRouter();
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      ...createArtworkEventsTransport(router.context, router),
    });
    try {
      const url = `http://127.0.0.1:${server.port}/v1/catalog/media/artwork/events`;
      expect((await fetch(url)).status).toBe(426);
      router.context.catalog = null;
      expect((await fetch(url)).status).toBe(503);
      expect((await fetch(`http://127.0.0.1:${server.port}/unknown`)).status).toBe(404);
    } finally {
      await server.stop(true);
    }
  });
});
