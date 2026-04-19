import { ConfigurationServiceError } from '@errors/configuration.errors';

jest.mock('@inquirer/prompts', () => ({
  confirm: jest.fn(),
  input: jest.fn(),
  password: jest.fn(),
  select: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock('tty', () => ({
  isatty: jest.fn(),
}));

import { confirm, input } from '@inquirer/prompts';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { isatty } from 'tty';

import type { ConfigurableService, ValidatorTransform, VariableInfo } from '@mytypes/configuration';

import {
  applyTransform,
  configureService,
  getDefaultValue,
  handlerFromInstance,
  isNonInteractiveMode,
  isValidConfigUpdate,
  saveToEnvFile,
  validateExistingConfiguration,
} from './configuration.utils';

const mockIsatty = isatty as jest.MockedFunction<typeof isatty>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockWriteFileSync = writeFileSync as jest.MockedFunction<typeof writeFileSync>;
const mockInput = input as jest.MockedFunction<typeof input>;
const mockConfirm = confirm as jest.MockedFunction<typeof confirm>;

const makeMockService = (isReady: boolean): ConfigurableService => ({
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

// ---------------------------------------------------------------------------

describe('getDefaultValue', () => {
  it('returns the string directly', () => {
    expect(getDefaultValue('hello')).toBe('hello');
  });

  it('calls the factory function and returns its result', () => {
    const factory = jest.fn().mockReturnValue('generated');
    expect(getDefaultValue(factory)).toBe('generated');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------

describe('applyTransform', () => {
  const plainVarInfo: VariableInfo = { description: 'test', required: false };

  const makeTransformVarInfo = (
    transform: ValidatorTransform<unknown>,
    extra?: Record<string, unknown>
  ): VariableInfo =>
    ({
      description: 'test',
      required: false,
      transform,
      ...extra,
    }) as VariableInfo;

  it('returns rawValue unchanged when no transform is defined', () => {
    expect(applyTransform('JWT_SECRET', plainVarInfo, 'my-secret')).toBe('my-secret');
  });

  it('returns rawValue unchanged when rawValue is empty (skips transform)', () => {
    const transform = jest.fn().mockReturnValue({ isValid: true, value: 'should-not-run' });
    expect(applyTransform('JWT_SECRET', makeTransformVarInfo(transform), '')).toBe('');
    expect(transform).not.toHaveBeenCalled();
  });

  it('returns the transformed value when transform passes', () => {
    const varInfo = makeTransformVarInfo(v => ({ isValid: true, value: v.toUpperCase() }));
    expect(applyTransform('JWT_SECRET', varInfo, 'abc')).toBe('ABC');
  });

  it('throws ConfigurationServiceError when transform fails', () => {
    const varInfo = makeTransformVarInfo(() => ({ isValid: false, error: 'must be longer' }));
    expect(() => applyTransform('JWT_SECRET', varInfo, 'x')).toThrow(ConfigurationServiceError);
    expect(() => applyTransform('JWT_SECRET', varInfo, 'x')).toThrow('must be longer');
  });

  it('includes the example in the error message', () => {
    const varInfo = makeTransformVarInfo(() => ({ isValid: false, error: 'bad' }), {
      example: 'abc-example',
    });
    expect(() => applyTransform('JWT_SECRET', varInfo, 'x')).toThrow('abc-example');
  });

  it('includes suggestions in the error message', () => {
    const varInfo = makeTransformVarInfo(() => ({
      isValid: false,
      error: 'bad',
      suggestions: ['option-a', 'option-b'],
    }));
    expect(() => applyTransform('JWT_SECRET', varInfo, 'x')).toThrow('option-a, option-b');
  });
});

// ---------------------------------------------------------------------------

describe('isValidConfigUpdate', () => {
  it('returns true for an empty array', () => {
    expect(isValidConfigUpdate([])).toBe(true);
  });

  it('returns true when all keys are known variable names', () => {
    expect(isValidConfigUpdate([{ key: 'JWT_SECRET', value: 'x' }])).toBe(true);
  });

  it('returns false when any key is unknown', () => {
    expect(
      isValidConfigUpdate([
        { key: 'JWT_SECRET', value: 'x' },
        { key: 'NOT_A_REAL_VAR', value: 'y' },
      ])
    ).toBe(false);
  });

  it('returns false for a single unknown key', () => {
    expect(isValidConfigUpdate([{ key: 'TOTALLY_FAKE', value: 'v' }])).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('saveToEnvFile', () => {
  it('creates the file when it does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    saveToEnvFile({ JWT_SECRET: 'secret123' } as never);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      'JWT_SECRET=secret123\n',
      'utf-8'
    );
  });

  it('updates an existing key in-place', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('JWT_SECRET=oldvalue\nOTHER=keep\n' as never);

    saveToEnvFile({ JWT_SECRET: 'newvalue' } as never);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('JWT_SECRET=newvalue');
    expect(written).not.toContain('JWT_SECRET=oldvalue');
    expect(written).toContain('OTHER=keep');
  });

  it('appends a new key when it is not already in the file', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('OTHER=keep\n' as never);

    saveToEnvFile({ JWT_SECRET: 'brand-new' } as never);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('JWT_SECRET=brand-new');
    expect(written).toContain('OTHER=keep');
  });

  it('writes multiple vars in a single call', () => {
    mockExistsSync.mockReturnValue(false);

    saveToEnvFile({ JWT_SECRET: 'a', STREAM_KEY_SALT: 'b' } as never);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('JWT_SECRET=a');
    expect(written).toContain('STREAM_KEY_SALT=b');
  });
});

// ---------------------------------------------------------------------------

describe('validateExistingConfiguration', () => {
  it('returns an empty array when no services are registered (all pass trivially)', async () => {
    const result = await validateExistingConfiguration(new Map());
    expect(result).toEqual([]);
  });

  it('returns an empty array when all registered services are alive', async () => {
    const map = new Map<string, ConfigurableService>([
      ['TMDB', makeMockService(true)],
      ['JWT', makeMockService(true)],
    ]);
    const result = await validateExistingConfiguration(map);
    expect(result).toEqual([]);
  });

  it('returns the service entry when the registered service is not ready after reload', async () => {
    const map = new Map<string, ConfigurableService>([['TMDB', makeMockService(false)]]);
    const result = await validateExistingConfiguration(map);
    expect(result).toContainEqual({ serviceKey: 'TMDB', error: 'Not ready' });
  });

  it('returns the service entry with the reload error message on reload failure', async () => {
    const instance: ConfigurableService = {
      getStatus: () => ({ status: 'error', errorMessage: 'not ready', error: null }),
      reload: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const map = new Map<string, ConfigurableService>([['TMDB', instance]]);
    const result = await validateExistingConfiguration(map);
    expect(result).toContainEqual({ serviceKey: 'TMDB', error: 'connection refused' });
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
