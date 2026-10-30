import { configureFakerSeed } from '@__test-utils__/utils';
import {
  defineService,
  type Impl,
  type ManagedConfiguration,
  type RunningServer,
  serve,
} from '@miauflix/contract';
import { type ArtworkUpdate, catalog, type MovieDetail } from '@miauflix/contracts';

import { CatalogClientService } from '@services/catalog/catalog-client.service';
import type { ConfigurationService } from '@services/configuration/configuration.service';

const movie: MovieDetail = {
  mediaType: 'movie',
  mediaId: 603,
  imdbId: 'tt0133093',
  title: 'The Matrix',
  overview: '',
  tagline: '',
  releaseDate: '1999-03-30',
  runtime: 136,
  poster: '',
  backdrop: '',
  backdropFocus: null,
  logo: '',
  genres: [],
  popularity: 10,
  rating: 8.2,
  detailsSyncedAt: null,
};

const update: ArtworkUpdate = {
  mediaType: 'movie',
  mediaId: 42,
  backdrop: 'backdrop.jpg',
  logo: 'card.png',
  heroLogo: 'hero.png',
  artworkRevision: 1,
  cardLogoStatus: 'ready',
  heroLogoStatus: 'ready',
};

const until = async (check: () => boolean) => {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > 3_000) throw new Error('Condition not met in time');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

/** A served catalog with only the methods these tests use. */
const startCatalog = async (port = 0) => {
  const artworkListeners = new Set<(update: ArtworkUpdate) => void>();
  const getMovieCalls: Array<{ mediaId: number; language: string }> = [];
  const configuration: ManagedConfiguration = {
    getSchema: () => ({ groups: [] }),
    ready: true,
    test: async () => ({ success: true, mode: 'validation', message: 'ok' }),
    applyRemote: async () => ({ success: true, activated: true }),
    clearRemote: async () => ({ success: true, activated: false }),
    subscribe: () => () => undefined,
  };
  const impl: Partial<Impl<typeof catalog>> = {
    getMovie: async (input, ctx) => {
      getMovieCalls.push(input);
      await new Promise(resolve => setTimeout(resolve, 10));
      return input.mediaId === 603 ? movie : ctx.fail('not_found');
    },
    artwork: emit => {
      artworkListeners.add(emit);
      return () => artworkListeners.delete(emit);
    },
  };
  const unimplemented = () => {
    throw new Error('not used by this test');
  };
  const service = defineService({
    info: { id: 'media-catalog', name: 'Catalog', description: 'Fake', version: '1' },
    configuration,
  }).implement(
    catalog,
    new Proxy(impl, {
      get: (target, key: string) => target[key as keyof typeof target] ?? unimplemented,
    }) as Impl<typeof catalog>
  );
  const server = await serve(service, { hostname: '127.0.0.1', port });
  return {
    server,
    getMovieCalls,
    emitArtwork: (value: ArtworkUpdate) => artworkListeners.forEach(listener => listener(value)),
    artworkSubscribers: () => artworkListeners.size,
  };
};

const connectClient = (server: RunningServer) => {
  const configuration = {
    getDynamic: jest.fn(
      (key: string) =>
        ({
          CATALOG_SERVICE_URL: `http://127.0.0.1:${server.port}`,
          CATALOG_SERVICE_TIMEOUT_MS: '2000',
        })[key]
    ),
    registerRemoteConfiguration: jest.fn(),
    getServiceConfigSnapshot: jest.fn(() => ({})),
  };
  return new CatalogClientService(configuration as unknown as ConfigurationService);
};

describe('CatalogClientService', () => {
  const servers: RunningServer[] = [];
  const clients: CatalogClientService[] = [];
  const setupTest = async () => {
    const fake = await startCatalog();
    servers.push(fake.server);
    const client = connectClient(fake.server);
    clients.push(client);
    await client.initialize();
    await until(() => client.isReady());
    return { ...fake, client };
  };

  beforeAll(() => configureFakerSeed());

  afterEach(async () => {
    clients.splice(0).forEach(client => client.stop());
    await Promise.all(servers.splice(0).map(server => server.stop()));
  });

  it('calls the catalog with typed inputs and maps not_found to null', async () => {
    const { client, getMovieCalls } = await setupTest();

    await expect(client.getMovie(603, 'pt-BR')).resolves.toEqual(movie);
    await expect(client.getMovie(1, 'en')).resolves.toBeNull();
    expect(getMovieCalls).toEqual([
      { mediaId: 603, language: 'pt-BR' },
      { mediaId: 1, language: 'en' },
    ]);
  });

  it('shares concurrent identical reads but not completed ones', async () => {
    const { client, getMovieCalls } = await setupTest();

    await Promise.all([client.getMovie(603, 'en'), client.getMovie(603, 'en')]);
    await client.getMovie(603, 'en');

    expect(getMovieCalls).toHaveLength(2);
  });

  it('delivers artwork updates and announces a resync after reconnecting', async () => {
    const first = await setupTest();
    const received: ArtworkUpdate[] = [];
    let resyncs = 0;
    first.client.onArtworkStreamReady(() => (resyncs += 1));
    const off = first.client.onArtwork(value => received.push(value));
    await until(() => first.artworkSubscribers() === 1);

    first.emitArtwork(update);
    await until(() => received.length === 1);
    expect(received).toEqual([update]);

    const port = first.server.port;
    await first.server.stop();
    servers.splice(servers.indexOf(first.server), 1);
    const second = await startCatalog(port);
    servers.push(second.server);
    await until(() => second.artworkSubscribers() === 1);
    expect(resyncs).toBe(1);

    off();
    await until(() => second.artworkSubscribers() === 0);
  });
});
