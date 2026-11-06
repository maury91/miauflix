import { configureFakerSeed } from '@__test-utils__/utils';
import {
  defineService,
  type ManagedConfiguration,
  type RunningServer,
  serve,
} from '@miauflix/contract';
import { mediaLoad } from '@miauflix/service-contracts';

import type { ConfigurationService } from '@services/configuration/configuration.service';
import { ErrorWithStatus } from '@services/source/services/error-with-status.util';

import { MediaLoadClientService } from './media-load-client.service';

const until = async (check: () => boolean) => {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > 3_000) throw new Error('Condition not met in time');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

/** A served media-load whose scrapes answer 9 seeders, or fail for hashes starting with f. */
const startMediaLoad = async () => {
  const configuration: ManagedConfiguration = {
    getSchema: () => ({ groups: [] }),
    ready: true,
    test: async () => ({ success: true, mode: 'validation', message: 'ok' }),
    applyRemote: async () => ({ success: true, activated: true }),
    clearRemote: async () => ({ success: true, activated: false }),
    subscribe: () => () => undefined,
  };
  const service = defineService({
    info: { id: 'media-load', name: 'Media load', description: 'Fake', version: '1' },
    configuration,
  }).implement(mediaLoad, {
    swarmStats: async ({ hash }, ctx) =>
      hash.startsWith('f')
        ? ctx.fail('scrape_timeout', `Scrape request timed out for ${hash}`)
        : { complete: 9, incomplete: 3 },
  });
  return serve(service, { hostname: '127.0.0.1', port: 0 });
};

describe('MediaLoadClientService', () => {
  const servers: RunningServer[] = [];
  const clients: MediaLoadClientService[] = [];

  beforeAll(() => configureFakerSeed());

  afterEach(async () => {
    clients.splice(0).forEach(client => client.stop());
    await Promise.all(servers.splice(0).map(server => server.stop()));
  });

  const setupTest = async () => {
    const server = await startMediaLoad();
    servers.push(server);
    const client = new MediaLoadClientService({
      getDynamic: jest.fn(
        (key: string) =>
          ({
            MEDIA_LOAD_SERVICE_URL: `http://127.0.0.1:${server.port}`,
            MEDIA_LOAD_SERVICE_TIMEOUT_MS: '2000',
          })[key]
      ),
      registerRemoteConfiguration: jest.fn(),
      getServiceConfigSnapshot: jest.fn(() => ({})),
    } as unknown as ConfigurationService);
    clients.push(client);
    await client.initialize();
    await until(() => client.isReady());
    return { client };
  };

  it('returns seeders and leechers as broadcasters and watchers', async () => {
    const { client } = await setupTest();
    await expect(client.swarmStats('a'.repeat(40))).resolves.toEqual({
      broadcasters: 9,
      watchers: 3,
    });
  });

  it('turns scrape errors into ErrorWithStatus with the contract code', async () => {
    const { client } = await setupTest();
    const error = await client.swarmStats('f'.repeat(40)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorWithStatus);
    expect(error).toMatchObject({ status: 'scrape_timeout' });
  });
});
