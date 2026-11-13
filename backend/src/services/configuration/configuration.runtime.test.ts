import type { ConfigurableService } from '@mytypes/configuration';

import {
  probeRemoteConsumer,
  restoreRuntimeServices,
  rollbackRemoteConsumers,
  serviceStatusMessage,
} from './configuration.runtime';
import type { ConfigServiceActionResult, ServiceName } from './configuration.types';

const remote = (overrides: Partial<ConfigurableService> = {}): ConfigurableService => ({
  testable: true,
  getStatus: () => ({ status: 'ready' }),
  reload: jest.fn().mockResolvedValue(undefined),
  testConfiguration: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
  applyConfiguration: jest.fn().mockResolvedValue({ success: true }),
  clearConfiguration: jest.fn().mockResolvedValue({ success: true }),
  ...overrides,
});

const okResult = (service: string): ConfigServiceActionResult => ({
  service,
  success: true,
  testMode: 'live',
  message: 'ok',
});

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('serviceStatusMessage', () => {
  it('describes unregistered and failing services', () => {
    const services = new Map<ServiceName, ConfigurableService>([
      [
        'CATALOG',
        remote({ getStatus: () => ({ status: 'error', errorMessage: 'down', error: null }) }),
      ],
    ]);
    expect(serviceStatusMessage(services, 'CATALOG')).toBe('down');
    expect(serviceStatusMessage(services, 'LIST')).toBe('LIST is not registered for a live test.');
  });
});

describe('restoreRuntimeServices', () => {
  it('reloads each service and returns those whose reload threw', async () => {
    const ok = remote();
    const broken = remote({ reload: jest.fn().mockRejectedValue(new Error('boom')) });
    const services = new Map<ServiceName, ConfigurableService>([
      ['CATALOG', ok],
      ['LIST', broken],
    ]);

    expect(await restoreRuntimeServices(services, ['CATALOG', 'LIST', 'SOURCES'])).toEqual([
      'LIST',
    ]);
    expect(ok.reload).toHaveBeenCalledTimes(1);
  });

  it('also returns services that were ready before and are not ready after reloading', async () => {
    const failing = remote({
      getStatus: () => ({ status: 'error', errorMessage: 'down', error: null }),
    });
    const services = new Map<ServiceName, ConfigurableService>([
      ['CATALOG', failing],
      ['LIST', failing],
    ]);

    expect(await restoreRuntimeServices(services, ['CATALOG', 'LIST'], new Set(['LIST']))).toEqual([
      'LIST',
    ]);
  });
});

describe('restoreRuntimeServices with the services ready before', () => {
  it('does not count a service that was already failing, even when its reload throws', async () => {
    const throwing = () => remote({ reload: jest.fn().mockRejectedValue(new Error('boom')) });
    const services = new Map<ServiceName, ConfigurableService>([
      ['CATALOG', throwing()],
      ['LIST', throwing()],
    ]);

    expect(await restoreRuntimeServices(services, ['CATALOG', 'LIST'], new Set(['LIST']))).toEqual([
      'LIST',
    ]);
  });
});

describe('probeRemoteConsumer', () => {
  it('passes the snapshot as entries and reports the test result', async () => {
    const instance = remote({
      testConfiguration: jest
        .fn()
        .mockResolvedValue({ success: true, mode: 'validation', message: 'fine' }),
    });
    const result = await probeRemoteConsumer(new Map([['CATALOG', instance]]), 'CATALOG', {
      A: '1',
    });
    expect(instance.testConfiguration).toHaveBeenCalledWith([{ key: 'A', value: '1' }]);
    expect(result).toEqual({
      service: 'CATALOG',
      success: true,
      testMode: 'validation',
      message: 'fine',
    });
  });

  it('fails when the service cannot be tested', async () => {
    const result = await probeRemoteConsumer(new Map(), 'CATALOG', {});
    expect(result).toMatchObject({
      success: false,
      message: 'CATALOG is unavailable for configuration testing',
    });
  });
});

describe('rollbackRemoteConsumers', () => {
  it('re-applies previous snapshots and clears consumers that had none', async () => {
    const catalog = remote();
    const list = remote();
    await rollbackRemoteConsumers(
      new Map([
        ['CATALOG', catalog],
        ['LIST', list],
      ]),
      ['CATALOG', 'LIST'],
      new Map([
        ['CATALOG', { A: 'old' }],
        ['LIST', undefined],
      ]),
      [],
      { rejectedMessage: () => 'rejected', logFailures: false, markFailed: true }
    );
    expect(catalog.applyConfiguration).toHaveBeenCalledWith([{ key: 'A', value: 'old' }]);
    expect(list.clearConfiguration).toHaveBeenCalledTimes(1);
  });

  it.each([
    [true, false],
    [false, true],
  ])('notes a rejected rollback on the result (markFailed=%s)', async (markFailed, success) => {
    const results = [okResult('CATALOG')];
    await rollbackRemoteConsumers(
      new Map([
        [
          'CATALOG',
          remote({ clearConfiguration: jest.fn().mockResolvedValue({ success: false }) }),
        ],
      ]),
      ['CATALOG'],
      new Map(),
      results,
      { rejectedMessage: consumer => `${consumer} said no`, logFailures: false, markFailed }
    );
    expect(results[0]).toEqual({
      ...okResult('CATALOG'),
      success,
      message: 'ok; rollback failed: CATALOG said no',
    });
  });
});
