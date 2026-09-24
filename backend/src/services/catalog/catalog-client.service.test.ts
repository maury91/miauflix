import { configureFakerSeed } from '@__test-utils__/utils';

import { CatalogClientService } from '@services/catalog/catalog-client.service';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import type { RemoteServiceManager } from '@services/remote/remote-service.manager';

const movie = {
  mediaType: 'movie' as const,
  mediaId: 603,
  imdbId: 'tt0133093',
  title: 'The Matrix',
  overview: '',
  tagline: '',
  releaseDate: '1999-03-30',
  runtime: 136,
  poster: '',
  backdrop: '',
  logo: '',
  genres: [],
  popularity: 10,
  rating: 8.2,
  detailsSyncedAt: null,
};

const setupTest = () => {
  const client = new CatalogClientService({} as ConfigurationService);
  const remote = (client as unknown as { remote: RemoteServiceManager }).remote;
  jest.spyOn(remote, 'capabilityBasePath', 'get').mockReturnValue('/v1/catalog');
  jest.spyOn(remote, 'isReady').mockReturnValue(true);
  jest
    .spyOn(remote, 'request')
    .mockImplementation(async (schema, path) => schema.parse(path.includes('broken') ? {} : movie));
  return { client, remote };
};

describe('CatalogClientService contract validation', () => {
  beforeAll(() => {
    configureFakerSeed();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the discovered capability path and encodes query values', async () => {
    const { client, remote } = setupTest();
    await expect(client.getMovie(603, 'pt-BR')).resolves.toEqual(movie);
    expect(remote.request).toHaveBeenCalledWith(
      expect.any(Object),
      '/v1/catalog/movie/603?language=pt-BR',
      expect.objectContaining({ notFound: expect.any(Function) })
    );
  });

  it('does not share duplicate in-flight reads after completion', async () => {
    const { client, remote } = setupTest();
    await client.getMovie(603, 'en');
    await client.getMovie(603, 'en');
    expect(remote.request).toHaveBeenCalledTimes(2);
  });

  it('preserves omitted test entries and forwards clear operations', async () => {
    const { client, remote } = setupTest();
    const testConfiguration = jest.spyOn(remote, 'testConfiguration').mockResolvedValue({
      success: true,
      mode: 'live',
      message: 'valid',
    });
    const clearConfiguration = jest.spyOn(remote, 'clearConfiguration').mockResolvedValue({
      success: true,
    });

    await client.testConfiguration();
    await client.testConfiguration([]);
    await expect(client.clearConfiguration()).resolves.toEqual({ success: true });

    expect(testConfiguration.mock.calls).toEqual([[undefined], [[]]]);
    expect(clearConfiguration).toHaveBeenCalledTimes(1);
  });
});
