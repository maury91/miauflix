jest.mock('@services/configuration/configuration.service');

import type { ServiceStatus } from '@miauflix/contract';

import { ConfigurationService } from '@services/configuration/configuration.service';

import { VpnDetectionService, type VpnStatusSource } from '../vpn.service';

const createMockConfig = (disabled = false) => {
  const config = new ConfigurationService() as unknown as jest.Mocked<ConfigurationService>;
  config.getOrThrow.mockImplementation(((key: string) =>
    key === 'DISABLE_VPN_CHECK' ? disabled : undefined) as never);
  return config;
};

const setupTest = (disabled = false) => {
  const config = createMockConfig(disabled);
  const remoteStatus = jest.fn<Promise<ServiceStatus>, []>();
  const source: VpnStatusSource = { remoteStatus };
  const service = new VpnDetectionService(config, source, 1000);
  return { service, config, remoteStatus };
};

const reporting = (vpn?: string): ServiceStatus => ({
  state: 'ready',
  details: vpn === undefined ? {} : { vpn },
});

describe('VpnDetectionService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports the VPN as active when the sources service is protected', async () => {
    const { service, remoteStatus } = setupTest();
    remoteStatus.mockResolvedValue(reporting('protected'));

    await expect(service.isVpnActive()).resolves.toBe(true);
    service.stop();
  });

  it('treats a sources service with its own check disabled as active', async () => {
    const { service, remoteStatus } = setupTest();
    remoteStatus.mockResolvedValue(reporting('disabled'));

    await expect(service.isVpnActive()).resolves.toBe(true);
    service.stop();
  });

  it.each([['unprotected'], [undefined]])('reports %s as not active', async vpn => {
    const { service, remoteStatus } = setupTest();
    remoteStatus.mockResolvedValue(reporting(vpn));

    await expect(service.isVpnActive()).resolves.toBe(false);
    service.stop();
  });

  it('fails closed when the sources service cannot be reached', async () => {
    const { service, remoteStatus } = setupTest();
    remoteStatus.mockRejectedValue(new Error('Connection closed'));

    await expect(service.isVpnActive()).resolves.toBe(false);
    service.stop();
  });

  it('emits connect and disconnect as the reported state changes', async () => {
    const { service, remoteStatus } = setupTest();
    const connect = jest.fn();
    const disconnect = jest.fn();
    service.on('connect', connect);
    service.on('disconnect', disconnect);

    remoteStatus.mockResolvedValue(reporting('protected'));
    await jest.advanceTimersByTimeAsync(1000);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(service.status()).toEqual({ isVpnActive: true, disabled: false });

    remoteStatus.mockResolvedValue(reporting('unprotected'));
    await jest.advanceTimersByTimeAsync(1000);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(service.status()).toEqual({ isVpnActive: false, disabled: false });
    service.stop();
  });

  it('does not ask the sources service when the check is disabled', async () => {
    const { service, remoteStatus } = setupTest(true);

    await jest.advanceTimersByTimeAsync(5000);

    expect(remoteStatus).not.toHaveBeenCalled();
    expect(service.status()).toEqual({ isVpnActive: null, disabled: true });
  });
});
