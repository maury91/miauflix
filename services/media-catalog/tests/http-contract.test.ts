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
  Object.assign(router, {
    publishArtwork: (update: Record<string, unknown>) => {
      for (const listener of artworkListeners) listener(update);
    },
  });
  return router;
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

  it('streams committed artwork updates and releases its subscription on cancellation', async () => {
    const router = setupReadyMediaRouter();
    const context = router as unknown as {
      publishArtwork: (update: Record<string, unknown>) => void;
    };
    const response = await router.handle(
      new Request('http://catalog/v1/catalog/media/artwork/events')
    );
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    const read = reader.read();
    context.publishArtwork({
      mediaType: 'tv',
      mediaId: 7,
      backdrop: 'backdrop.jpg',
      logo: 'card.png',
      heroLogo: 'hero.png',
      artworkRevision: 1,
      cardLogoStatus: 'ready',
      heroLogoStatus: 'ready',
    });
    const frame = await read;
    expect(new TextDecoder().decode(frame.value)).toContain('"mediaId":7');
    await reader.cancel();
  });
});
