import { createClient, isContractError, localTransport } from '@miauwatch/contract';
import {
  cardImageVersion,
  catalog as catalogContract,
  MAX_BATCH_ITEMS,
} from '@miauwatch/service-contracts';
import { describe, expect, it } from 'bun:test';

import { CatalogConfigService } from '../src/config/config.service';
import { HttpError } from '../src/errors';
import { createCatalogService } from '../src/service';
import type { ServiceContext } from '../src/service-context';

const emptyDb = () => {
  const watching: number[][] = [];
  const db = {
    db: {
      select: () => ({ from: () => ({ get: () => ({ total: 0 }), all: () => [] }) }),
    },
    writeQueue: { run: <T>(fn: () => T) => Promise.resolve(fn()) },
    setWatching: (ids: number[]) => void watching.push(ids),
  };
  return { db, watching };
};

const setupStandby = () => {
  const { db, watching } = emptyDb();
  const context = {
    config: new CatalogConfigService(),
    db,
    catalog: null,
    env: {},
  } as unknown as ServiceContext;
  const service = createCatalogService(context);
  return { service, watching, client: createClient(catalogContract, localTransport(service)) };
};

const setupReady = () => {
  const { db } = emptyDb();
  const artworkListeners = new Set<(update: unknown) => void>();
  const config = new CatalogConfigService();
  Object.defineProperty(config, 'state', { value: 'ready' });
  const catalog = {
    getMovie: async (mediaId: number) => {
      if (mediaId === 404) throw new HttpError(404, 'missing');
      return { mediaType: 'movie', mediaId, title: 'Movie' };
    },
    getTVShow: async () => null,
    cardImageSource: (ref: { mediaId: number }) =>
      ref.mediaId === 404
        ? null
        : ref.mediaId === 6
          ? { backdrop: 'backdrop.jpg', logo: '', title: 'Movie', revision: null }
          : ref.mediaId === 8
            ? { backdrop: 'backdrop.jpg', logo: '', title: '千と千尋', revision: 2 }
            : { backdrop: 'backdrop.jpg', logo: 'logo.png', title: 'Movie', revision: 3 },
    search: async (query: string, page: number) => ({
      page,
      totalPages: 1,
      totalResults: 1,
      results: [{ mediaType: 'movie', mediaId: 7, title: query }],
    }),
    discover: async (genre: string, page: number) => ({
      page,
      totalPages: 0,
      totalResults: 0,
      results: [],
      genre,
    }),
    batch: async () => ({ items: [], missing: [] }),
    queueArtwork: () => 1,
    onArtworkUpdate: (listener: (update: unknown) => void) => {
      artworkListeners.add(listener);
      return () => artworkListeners.delete(listener);
    },
  };
  const rendered: unknown[][] = [];
  const cardImages = {
    render: async (...args: unknown[]) => {
      rendered.push(args.slice(0, 3));
      expect(args[3]).toBeInstanceOf(AbortSignal);
      return { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/webp', etag: '"tag"' };
    },
  };
  const context = { config, db, catalog, cardImages, env: {} } as unknown as ServiceContext;
  const service = createCatalogService(context);
  return {
    service,
    artworkListeners,
    rendered,
    client: createClient(catalogContract, localTransport(service)),
  };
};

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected a failure');
};

describe('media-catalog service contract', () => {
  it('rejects data methods with not_configured while in standby', async () => {
    const { client, service } = setupStandby();
    const error = await failure(client.getMovie({ mediaId: 1, language: 'en' }));
    expect(isContractError(error, 'not_configured')).toBe(true);
    await service.stop();
  });

  it('accepts setWatching while in standby', async () => {
    const { client, watching, service } = setupStandby();
    await client.setWatching({ mediaIds: [1, 2] });
    expect(watching).toEqual([[1, 2]]);
    await service.stop();
  });

  it('serves /health in every state', async () => {
    const { service } = setupStandby();
    const response = await service.fetch(new Request('http://x/health'));
    expect(response.status).toBe(200);
    await service.stop();
  });

  it('maps missing titles to not_found', async () => {
    const { client, service } = setupReady();
    expect((await client.getMovie({ mediaId: 5, language: 'en' })).mediaId).toBe(5);
    expect(
      isContractError(await failure(client.getMovie({ mediaId: 404, language: 'en' })), 'not_found')
    ).toBe(true);
    expect(
      isContractError(await failure(client.getShow({ mediaId: 1, language: 'en' })), 'not_found')
    ).toBe(true);
    await service.stop();
  });

  it('validates search and discover input', async () => {
    const { client, service } = setupReady();
    const found = await client.search({ query: ' Dune ', page: 2, language: 'en' });
    expect(found).toMatchObject({ page: 2, results: [{ title: 'Dune' }] });
    await client.discover({ genre: 'anime', page: 1, language: 'en' });
    await client.discover({ genre: '18', page: 1, language: 'en' });
    for (const input of [
      client.search({ query: ' ', page: 1, language: 'en' }),
      client.search({ query: 'x', page: 501, language: 'en' }),
      client.discover({ genre: 'western', page: 1, language: 'en' }),
    ])
      expect(isContractError(await failure(input), 'bad_request')).toBe(true);
    await service.stop();
  });

  it('rejects an oversized batch and defaults errors', async () => {
    const { client, service } = setupReady();
    const items = Array.from({ length: MAX_BATCH_ITEMS + 1 }, (_, mediaId) => ({
      mediaType: 'movie' as const,
      mediaId: mediaId + 1,
    }));
    const error = await failure(
      client.batch({ items, language: 'en', artworkPriority: 'returned' })
    );
    expect(isContractError(error, 'bad_request')).toBe(true);
    const ok = await client.batch({
      items: items.slice(0, 1),
      language: 'en',
      artworkPriority: 'returned',
    });
    expect(ok.errors).toEqual([]);
    expect(await client.queueArtwork({ items: items.slice(0, 1), priority: 'focused' })).toBe(1);
    await service.stop();
  });

  it('delivers artwork updates and releases the subscription', async () => {
    const { client, artworkListeners, service } = setupReady();
    const update = {
      mediaType: 'tv' as const,
      mediaId: 7,
      backdrop: 'backdrop.jpg',
      logo: 'card.png',
      heroLogo: 'hero.png',
      artworkRevision: 1,
      cardLogoStatus: 'ready' as const,
      heroLogoStatus: 'ready' as const,
    };
    const received = new Promise<unknown>(resolve => {
      const off = client.artwork.on(payload => {
        off();
        resolve(payload);
      });
    });
    for (let attempt = 0; !artworkListeners.size && attempt < 100; attempt++) await Bun.sleep(5);
    for (const listener of artworkListeners) listener(update);
    expect(await received).toEqual(update);
    expect(artworkListeners.size).toBe(0);
    await service.stop();
  });

  it('serves card images with their revision, and not_found for unknown titles', async () => {
    const { client, rendered, service } = setupReady();
    const response = await client.cardImage.open({
      mediaType: 'movie',
      mediaId: 5,
      size: 'sm',
      format: 'webp',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('x-artwork-revision')).toBe(cardImageVersion(3));
    expect(response.headers.get('etag')).toBe('"tag"');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(rendered).toEqual([
      [{ backdrop: 'backdrop.jpg', logo: 'logo.png', title: 'Movie', revision: 3 }, 'sm', 'webp'],
    ]);
    const missing = client.cardImage.open({
      mediaType: 'movie',
      mediaId: 404,
      size: 'sm',
      format: 'webp',
    });
    expect(isContractError(await failure(missing), 'not_found')).toBe(true);
    // No logo, and a name the catalog's fonts cannot draw: nothing to draw on the card
    const nothingToDraw = client.cardImage.open({
      mediaType: 'movie',
      mediaId: 8,
      size: 'sm',
      format: 'webp',
    });
    expect(isContractError(await failure(nothingToDraw), 'not_found')).toBe(true);
    const unknownSize = client.cardImage.open({
      mediaType: 'movie',
      mediaId: 5,
      size: 'xl' as 'sm',
      format: 'webp',
    });
    expect(isContractError(await failure(unknownSize), 'bad_request')).toBe(true);
    await service.stop();
  });

  it('names no revision for a card image the revision does not determine', async () => {
    const { client, service } = setupReady();
    const response = await client.cardImage.open({
      mediaType: 'movie',
      mediaId: 6,
      size: 'sm',
      format: 'jpeg',
    });
    expect(response.status).toBe(200);
    expect(response.headers.has('x-artwork-revision')).toBe(false);
    await service.stop();
  });
});
