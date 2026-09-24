import { configureFakerSeed } from '@__test-utils__/utils';

import type { ConfigurationService } from '@services/configuration/configuration.service';
import { ListClientService } from '@services/list/list-client.service';
import type { RemoteServiceManager } from '@services/remote/remote-service.manager';

describe('ListClientService management adapter', () => {
  beforeAll(() => configureFakerSeed());

  it('preserves omitted test entries and forwards clear operations', async () => {
    const service = new ListClientService({} as ConfigurationService);
    const remote = (service as unknown as { remote: RemoteServiceManager }).remote;
    const testConfiguration = jest.spyOn(remote, 'testConfiguration').mockResolvedValue({
      success: true,
      mode: 'live',
      message: 'valid',
    });
    const clearConfiguration = jest.spyOn(remote, 'clearConfiguration').mockResolvedValue({
      success: true,
    });

    await service.testConfiguration();
    await service.testConfiguration([]);
    await expect(service.clearConfiguration()).resolves.toEqual({ success: true });

    expect(testConfiguration.mock.calls).toEqual([[undefined], [[]]]);
    expect(clearConfiguration).toHaveBeenCalledTimes(1);
  });
});
