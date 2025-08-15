import type {
  BaseVariableInfo,
  DefaultVariableInfo,
  ServiceConfiguration,
  SkipUserInteractionVariableInfo,
  UnTypedVariableInfo,
  ValidatedVariableInfo,
  ValidatorTransform,
  VariableInfo,
} from '@mytypes/configuration';

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public variable?: string
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

const timeMultipliers = {
  s: 1000,
  m: 60,
  h: 60,
  d: 24,
};
type TimeUnit = keyof typeof timeMultipliers;
(Object.entries(timeMultipliers) as [TimeUnit, number][]).reduce(
  (currentMultiplier, [key, value]) => {
    timeMultipliers[key] = currentMultiplier * value;
    return timeMultipliers[key];
  },
  1
);

// Combined validator-transforms
export const transforms = {
  string: (options?: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
  }): ValidatorTransform<string> => {
    return (value: string) => {
      // Validation
      if (options?.minLength && value.length < options.minLength) {
        return {
          isValid: false,
          error: `Must be at least ${options.minLength} characters`,
          suggestions: [`Current length: ${value.length}`],
        };
      }
      if (options?.maxLength && value.length > options.maxLength) {
        return {
          isValid: false,
          error: `Must be no more than ${options.maxLength} characters`,
          suggestions: [`Current length: ${value.length}`],
        };
      }
      if (options?.pattern && !options.pattern.test(value)) {
        return { isValid: false, error: 'Invalid format' };
      }

      // Transform (already a string)
      return { isValid: true, value };
    };
  },

  stringArray: (): ValidatorTransform<string[]> => (value: string) => {
    return { isValid: true, value: value.split(',').map(item => item.trim()) };
  },

  number:
    (options?: { min?: number; max?: number; integer?: boolean }): ValidatorTransform<number> =>
    (value: string) => {
      // Validation & Transform
      const num = parseFloat(value);
      if (isNaN(num)) {
        return {
          isValid: false,
          error: 'Must be a valid number',
          suggestions: ['Try: 123, 45.67, etc.'],
        };
      }
      if (options?.integer && !Number.isInteger(num)) {
        return {
          isValid: false,
          error: 'Must be an integer',
          suggestions: [`${Math.round(num)} (rounded)`],
        };
      }
      if (options?.min !== undefined && num < options.min) {
        return { isValid: false, error: `Must be at least ${options.min}` };
      }
      if (options?.max !== undefined && num > options.max) {
        return { isValid: false, error: `Must be no more than ${options.max}` };
      }

      return { isValid: true, value: num };
    },

  size:
    (units: string[] = ['B', 'KB', 'MB', 'GB', 'TB']): ValidatorTransform<bigint> =>
    (value: string) => {
      const regex = new RegExp(`^(\\d+)\\s*(${units.join('|')})$`, 'i');
      const match = value.match(regex);

      if (!match) {
        return {
          isValid: false,
          error: `Must be a valid size with units: ${units.join(', ')}`,
          suggestions: ['Try: 10MB, 1GB, 500KB'],
        };
      }

      try {
        const number = BigInt(match[1]);
        const unitMap = {
          B: 1n,
          KB: 1024n,
          MB: 1024n ** 2n,
          GB: 1024n ** 3n,
          TB: 1024n ** 4n,
        };
        const unit = match[2].toUpperCase() as keyof typeof unitMap;

        if (!(unit in unitMap)) {
          return {
            isValid: false,
            error: `Unknown unit: ${unit}`,
            suggestions: units,
          };
        }

        return { isValid: true, value: number * unitMap[unit] };
      } catch (error) {
        return {
          isValid: false,
          error: `Invalid size: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

  boolean: (): ValidatorTransform<boolean> => (value: string) => {
    const normalized = value.toLowerCase().trim();
    if (['true', 'false', '1', '0', 'yes', 'no'].includes(normalized)) {
      const boolValue = ['true', '1', 'yes'].includes(normalized);
      return { isValid: true, value: boolValue };
    }

    return {
      isValid: false,
      error: 'Must be a boolean value',
      suggestions: ['Try: true, false, yes, no, 1, 0'],
    };
  },

  url: (): ValidatorTransform<string> => (value: string) => {
    try {
      new URL(value);
      return { isValid: true, value };
    } catch {
      return {
        isValid: false,
        error: 'Must be a valid URL',
        suggestions: ['Try: https://example.com'],
      };
    }
  },

  time:
    (units: TimeUnit[] = Object.keys(timeMultipliers) as TimeUnit[]): ValidatorTransform<number> =>
    (value: string) => {
      const regex = new RegExp(`^(\\d+)([${units.join('')}])$`);
      const match = value.match(regex);

      if (!match) {
        return {
          isValid: false,
          error: `Must be a number followed by ${units.join(', ')} (e.g., 6h, 30m, 2d)`,
          suggestions: ['6h', '30m', '2d', '3600s'],
        };
      }

      const [, numberStr, unit] = match;
      const number = parseInt(numberStr, 10);

      if (!(unit in timeMultipliers)) {
        return {
          isValid: false,
          error: `Unknown time unit: ${unit}`,
          suggestions: units.map(u => `1${u}`),
        };
      }

      const milliseconds = number * timeMultipliers[unit as TimeUnit];
      return { isValid: true, value: milliseconds };
    },

  domain:
    (options?: { allowLocalhost?: boolean }): ValidatorTransform<string> =>
    (value: string) => {
      const v = value.trim();
      // RFC 1035/1123-ish hostname: total <=253, labels 1–63, no leading/trailing hyphens
      const DOMAIN_RE =
        /^(?=.{1,253}$)(?:(?!-)[A-Za-z0-9-]{1,63}(?<!-)\.)+(?:(?!-)[A-Za-z0-9-]{2,63}(?<!-))$/;
      if (options?.allowLocalhost && v.toLowerCase() === 'localhost') {
        return { isValid: true, value: v };
      }
      if (!DOMAIN_RE.test(v)) {
        return { isValid: false, error: 'Must be a valid domain (e.g., example.com)' };
      }
      return { isValid: true, value: v };
    },

  optional:
    <T>(baseTransform: ValidatorTransform<T>): ValidatorTransform<T | undefined> =>
    (value: string) => {
      if (!value.trim()) {
        return { isValid: true, value: undefined };
      }
      return baseTransform(value);
    },
};

// Helper to create validated variable with automatic type inference
export function variable<T>(
  config: { transform: ValidatorTransform<T> } & (
    | BaseVariableInfo
    | DefaultVariableInfo
    | SkipUserInteractionVariableInfo
  )
): ValidatedVariableInfo<T>;
export function variable(config: UnTypedVariableInfo): ValidatedVariableInfo<string>;
export function variable<T>(
  config:
    | UnTypedVariableInfo
    | (Omit<ValidatedVariableInfo<T>, 'transform'> & { transform: ValidatorTransform<T> })
): ValidatedVariableInfo<T> {
  return config as ValidatedVariableInfo<T>;
}

export function serviceConfiguration<T extends Record<string, VariableInfo>>(
  config: ServiceConfiguration<T>
): ServiceConfiguration<T> {
  return config;
}
