jest.mock('@inquirer/prompts', () => ({
  confirm: jest.fn(),
  input: jest.fn(),
  password: jest.fn(),
  select: jest.fn(),
}));

jest.mock('tty', () => ({
  isatty: jest.fn(),
}));

import { confirm, input, password } from '@inquirer/prompts';
import { isatty } from 'tty';

import type { ConfigurableService, VariableInfo } from '@mytypes/configuration';

import { configurationGroups } from './configuration.consts';
import type { SaveConfigsResult, ServiceName, VariableName } from './configuration.types';
import {
  configureService,
  handlerFromInstance,
  isNonInteractiveMode,
  runSetupWizard,
  type SetupWizardHost,
  validateExistingConfiguration,
} from './configuration.wizard';

const mockIsatty = isatty as jest.MockedFunction<typeof isatty>;
const mockInput = input as jest.MockedFunction<typeof input>;
const mockConfirm = confirm as jest.MockedFunction<typeof confirm>;
const mockPassword = password as jest.MockedFunction<typeof password>;

const makeMockService = (isReady: boolean): ConfigurableService => ({
  testable: true,
  getStatus: () =>
    isReady ? { status: 'ready' } : { status: 'error', errorMessage: 'not ready', error: null },
  reload: jest.fn().mockResolvedValue(undefined),
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('isNonInteractiveMode', () => {
  it('returns false when stdout is a TTY (interactive)', () => {
    mockIsatty.mockReturnValue(true);
    expect(isNonInteractiveMode()).toBe(false);
  });

  it('returns true when stdout is not a TTY (non-interactive)', () => {
    mockIsatty.mockReturnValue(false);
    expect(isNonInteractiveMode()).toBe(true);
  });
});

describe('handlerFromInstance', () => {
  it('isAlive reflects the instance isReady property', () => {
    const handler = handlerFromInstance(makeMockService(true));
    expect(handler.isAlive()).toBe(true);

    const handler2 = handlerFromInstance(makeMockService(false));
    expect(handler2.isAlive()).toBe(false);
  });

  it('reload delegates to instance.reload', async () => {
    const instance = makeMockService(true);
    const handler = handlerFromInstance(instance);
    await handler.reload();
    expect(instance.reload).toHaveBeenCalledTimes(1);
  });
});

describe('validateExistingConfiguration', () => {
  it('returns an empty array when no services are registered (all pass trivially)', async () => {
    const result = await validateExistingConfiguration(new Map());
    expect(result).toEqual([]);
  });

  it('returns an empty array when all registered services are alive', async () => {
    const map = new Map<string, ConfigurableService>([
      ['CATALOG', makeMockService(true)],
      ['JWT', makeMockService(true)],
    ]);
    const result = await validateExistingConfiguration(map);
    expect(result).toEqual([]);
  });

  it('returns the service entry when the registered service is not ready after reload', async () => {
    const map = new Map<string, ConfigurableService>([['CATALOG', makeMockService(false)]]);
    const result = await validateExistingConfiguration(map);
    expect(result).toContainEqual({ serviceKey: 'CATALOG', error: 'Not ready' });
  });

  it('returns the service entry with the reload error message on reload failure', async () => {
    const instance: ConfigurableService = {
      testable: true,
      getStatus: () => ({ status: 'error', errorMessage: 'not ready', error: null }),
      reload: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const map = new Map<string, ConfigurableService>([['CATALOG', instance]]);
    const result = await validateExistingConfiguration(map);
    expect(result).toContainEqual({ serviceKey: 'CATALOG', error: 'connection refused' });
  });
});

// ---------------------------------------------------------------------------

describe('configureService', () => {
  const makeTestService = (variables: Record<string, VariableInfo>) =>
    ({
      name: 'Test',
      description: 'Test service',
      variables,
    }) as never;

  it('calls applyValues with the prompted value for a required variable', async () => {
    mockInput.mockResolvedValue('my-entered-value');
    const applyValues = jest.fn().mockResolvedValue(undefined);

    await configureService(makeTestService({ MY_VAR: { description: 'A var', required: true } }), {
      currentValues: {},
      applyValues,
    });

    expect(applyValues).toHaveBeenCalledWith({ MY_VAR: 'my-entered-value' });
  });

  it('keeps the current value of a required password when the input is left empty', async () => {
    let validation: boolean | string | undefined;
    mockPassword.mockImplementation((async ({
      validate,
    }: {
      validate: (value: string) => Promise<boolean | string> | boolean | string;
    }) => {
      validation = await validate('');
      return '';
    }) as never);
    const applyValues = jest.fn().mockResolvedValue(undefined);

    await configureService(
      makeTestService({ SECRET: { description: 'A secret', required: true, password: true } }),
      { currentValues: { SECRET: 'existing-secret' }, applyValues }
    );

    expect(validation).toBe(true);
    expect(applyValues).toHaveBeenCalledWith({ SECRET: 'existing-secret' });
  });

  it('populates currentValues as the default for the prompt', async () => {
    mockInput.mockResolvedValue('prefilled');
    const applyValues = jest.fn().mockResolvedValue(undefined);

    await configureService(makeTestService({ MY_VAR: { description: 'A var', required: false } }), {
      currentValues: { MY_VAR: 'prefilled' },
      applyValues,
    });

    expect(applyValues).toHaveBeenCalledWith({ MY_VAR: 'prefilled' });
  });

  it('does not prompt for retry when no handler is provided', async () => {
    mockInput.mockResolvedValue('v');
    const applyValues = jest.fn().mockResolvedValue(undefined);

    await configureService(makeTestService({ V: { description: 'd', required: true } }), {
      currentValues: {},
      applyValues,
    });

    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('does not prompt for retry when handler succeeds after config', async () => {
    mockInput.mockResolvedValue('v');
    const applyValues = jest.fn().mockResolvedValue(undefined);
    const instance = makeMockService(true);

    await configureService(makeTestService({ V: { description: 'd', required: true } }), {
      currentValues: {},
      applyValues,
      handler: handlerFromInstance(instance),
    });

    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('prompts for retry when handler reports failure and skips retry when user declines', async () => {
    mockInput.mockResolvedValue('bad-value');
    const applyValues = jest.fn().mockResolvedValue(undefined);
    const instance = makeMockService(false);
    mockConfirm.mockResolvedValue(false);

    const result = await configureService(
      makeTestService({ V: { description: 'd', required: true } }),
      { currentValues: {}, applyValues, handler: handlerFromInstance(instance) }
    );

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ V: 'bad-value' });
  });
});
// ---------------------------------------------------------------------------

describe('runSetupWizard', () => {
  const allVariables = () =>
    Object.entries(configurationGroups).flatMap(([group, definition]) =>
      Object.keys(definition.variables).map(key => [key as VariableName, group] as const)
    );

  /** A host where every variable is set to 'x' except `missing`. */
  const makeHost = (
    missing: VariableName[] = [],
    overrides: Partial<SetupWizardHost> = {}
  ): SetupWizardHost & { values: Map<VariableName, string> } => {
    const values = new Map<VariableName, string>(
      allVariables().map(([key]) => [key, missing.includes(key) ? '' : 'x'])
    );
    return {
      values,
      getRawValue: key => values.get(key),
      variableGroups: new Map(allVariables()),
      registeredServices: new Map<ServiceName, ConfigurableService>(),
      isRemoteGroup: () => false,
      saveServiceConfigs: jest.fn(async (_group, entries) => {
        for (const { key, value } of entries) values.set(key as VariableName, value);
        return { success: true, services: [] } as unknown as SaveConfigsResult;
      }),
      setValue: jest.fn().mockResolvedValue(true),
      waitForServicesReady: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  };

  it('reports groups with a missing required value and starts degraded without a TTY', async () => {
    mockIsatty.mockReturnValue(false);
    const host = makeHost(['SOURCES_SERVICE_URL']);

    const result = await runSetupWizard(host, {});

    expect([...result.servicesNeedingConfiguration]).toEqual(['SOURCES']);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('missing required environment variables for: SOURCES')
    );
    expect(mockInput).not.toHaveBeenCalled();
    expect(host.saveServiceConfigs).not.toHaveBeenCalled();
  });

  it('self-tests registered services when nothing is missing', async () => {
    mockIsatty.mockReturnValue(false);
    const host = makeHost([], {
      registeredServices: new Map([
        ['CATALOG', makeMockService(false)],
        ['LIST', makeMockService(true)],
      ]),
    });

    const result = await runSetupWizard(host, {});

    expect([...result.servicesNeedingConfiguration]).toEqual(['CATALOG']);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('validation test failed for: CATALOG: Not ready')
    );
  });

  it('needs nothing when every value is set and every service passes its self-test', async () => {
    mockIsatty.mockReturnValue(false);
    const result = await runSetupWizard(makeHost(), {});
    expect(result.servicesNeedingConfiguration.size).toBe(0);
  });

  it('skips the self-test when forced, and reports only what is still missing', async () => {
    mockIsatty.mockReturnValue(false);
    const instance = makeMockService(false);
    const host = makeHost(['SOURCES_SERVICE_URL'], {
      registeredServices: new Map([['CATALOG', instance]]),
    });

    const result = await runSetupWizard(host, { forceReconfigure: true });

    expect([...result.servicesNeedingConfiguration]).toEqual(['SOURCES']);
    expect(instance.reload).not.toHaveBeenCalled();
  });

  it('self-tests complete groups even when another group is missing a value', async () => {
    mockIsatty.mockReturnValue(false);
    const host = makeHost(['SOURCES_SERVICE_URL'], {
      registeredServices: new Map([['CATALOG', makeMockService(false)]]),
    });

    const result = await runSetupWizard(host, {});

    expect([...result.servicesNeedingConfiguration].sort()).toEqual(['CATALOG', 'SOURCES']);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('validation test failed for: CATALOG: Not ready')
    );
  });

  it('returns only the groups still needing configuration after an interactive save', async () => {
    mockIsatty.mockReturnValue(true);
    mockInput.mockImplementation((async ({
      message,
      default: current,
    }: {
      message: string;
      default?: string;
    }) => (message.includes('SOURCES_SERVICE_URL') ? 'http://sources:3000' : current)) as never);

    const result = await runSetupWizard(makeHost(['SOURCES_SERVICE_URL']), {});

    expect(result.servicesNeedingConfiguration.size).toBe(0);
  });

  it('exits with an error in config-only mode when a required value is still missing', async () => {
    mockIsatty.mockReturnValue(false);
    const exit = jest.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as never);

    await expect(
      runSetupWizard(makeHost(['SOURCES_SERVICE_URL']), {
        forceReconfigure: true,
        configOnly: true,
      })
    ).rejects.toThrow('exit 1');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('keeps a group the user left failing among those still needing configuration', async () => {
    mockIsatty.mockReturnValue(true);
    mockInput.mockImplementation(
      (async ({ default: current }: { default?: string }) => current) as never
    );
    mockConfirm.mockResolvedValue(false);
    const host = makeHost([], {
      registeredServices: new Map([['CATALOG', makeMockService(false)]]),
    });

    const result = await runSetupWizard(host, {});

    expect([...result.servicesNeedingConfiguration]).toEqual(['CATALOG']);
  });

  it('does not report a non-testable service that is still initializing as failing', async () => {
    mockIsatty.mockReturnValue(true);
    mockInput.mockImplementation(
      (async ({ default: current }: { default?: string }) => current) as never
    );
    mockPassword.mockResolvedValue('');
    const server: ConfigurableService = {
      testable: false,
      getStatus: () => ({ status: 'initializing', details: 'starting', startedAt: 0 }),
      reload: jest.fn().mockResolvedValue(undefined),
    };
    const host = makeHost([], { registeredServices: new Map([['SERVER', server]]) });

    const result = await runSetupWizard(host, { forceReconfigure: true });

    expect(result.servicesNeedingConfiguration.has('SERVER')).toBe(false);
  });

  it('prompts for each group in a TTY, saves it, and persists the changed values', async () => {
    mockIsatty.mockReturnValue(true);
    mockInput.mockImplementation((async ({
      message,
      default: current,
    }: {
      message: string;
      default?: string;
    }) => (message.includes('SOURCES_SERVICE_URL') ? 'http://sources:3000' : current)) as never);
    const host = makeHost(['SOURCES_SERVICE_URL']);

    await runSetupWizard(host, {});

    expect(host.waitForServicesReady).toHaveBeenCalledWith(30_000);
    expect(host.saveServiceConfigs).toHaveBeenCalledWith(
      'SOURCES',
      expect.arrayContaining([{ key: 'SOURCES_SERVICE_URL', value: 'http://sources:3000' }])
    );
    expect(host.setValue).toHaveBeenCalledTimes(1);
    expect(host.setValue).toHaveBeenCalledWith('SOURCES_SERVICE_URL', 'http://sources:3000');
  });

  it('does not persist values of remote groups locally', async () => {
    mockIsatty.mockReturnValue(true);
    mockInput.mockImplementation((async ({
      message,
      default: current,
    }: {
      message: string;
      default?: string;
    }) => (message.includes('SOURCES_SERVICE_URL') ? 'http://sources:3000' : current)) as never);
    const host = makeHost(['SOURCES_SERVICE_URL'], { isRemoteGroup: () => true });

    await runSetupWizard(host, {});

    expect(host.saveServiceConfigs).toHaveBeenCalledTimes(1);
    expect(host.setValue).not.toHaveBeenCalled();
  });
});
