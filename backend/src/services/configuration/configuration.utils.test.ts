import { ConfigurationServiceError } from '@errors/configuration.errors';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

import { existsSync, readFileSync, writeFileSync } from 'fs';

import type { ValidatorTransform, VariableInfo } from '@mytypes/configuration';

import {
  applyTransform,
  assertKnownConfigKeys,
  buildAllConfigs,
  getDefaultValue,
  isValidConfigUpdate,
  saveToEnvFile,
} from './configuration.utils';

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockWriteFileSync = writeFileSync as jest.MockedFunction<typeof writeFileSync>;

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

describe('buildAllConfigs', () => {
  it('includes UI input metadata derived from configuration transforms', () => {
    const entries = buildAllConfigs(new Map());

    expect(entries.find(entry => entry.key === 'ALLOW_TV_APP')).toMatchObject({
      inputType: 'boolean',
      advanced: true,
      booleanStateDescriptions: {
        true: 'TV app allowed',
        false: 'TV app blocked',
      },
    });
    expect(entries.find(entry => entry.key === 'PORT')).toMatchObject({
      inputType: 'number',
      numberOptions: { min: 1, max: 65535, integer: true },
    });
    expect(entries.find(entry => entry.key === 'MAXIMUM_CACHE_EMPTY_SPACE')).toMatchObject({
      inputType: 'size',
      sizeUnits: ['B', 'KB', 'MB', 'GB', 'TB'],
    });
    expect(entries.find(entry => entry.key === 'ACCESS_TOKEN_EXPIRATION')).toMatchObject({
      inputType: 'time',
      timeUnits: ['s', 'm', 'h', 'd'],
    });
    expect(entries.find(entry => entry.key === 'CORS_ORIGIN')).toMatchObject({ inputType: 'text' });
    expect(entries.find(entry => entry.key === 'CATALOG_SERVICE_URL')).toMatchObject({
      label: 'Catalog Service URL',
      required: true,
      advanced: true,
    });
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

  it('writes to the project-root .env when the backend is the working directory', () => {
    jest.spyOn(process, 'cwd').mockReturnValue('/project/backend');
    mockExistsSync.mockReturnValue(false);

    saveToEnvFile({ JWT_SECRET: 'secret123' } as never);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/project/.env',
      'JWT_SECRET=secret123\n',
      'utf-8'
    );
  });
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

describe('assertKnownConfigKeys', () => {
  it('accepts entries whose keys are all known variables', () => {
    expect(() => assertKnownConfigKeys([{ key: 'CATALOG_SERVICE_URL', value: 'x' }])).not.toThrow();
  });

  it('throws unknown_config_key naming only the unknown keys', () => {
    const run = () =>
      assertKnownConfigKeys([
        { key: 'CATALOG_SERVICE_URL', value: 'x' },
        { key: 'NOT_A_REAL_KEY', value: 'y' },
      ]);
    expect(run).toThrow(ConfigurationServiceError);
    expect(run).toThrow('Unknown configuration keys: NOT_A_REAL_KEY');
  });
});
