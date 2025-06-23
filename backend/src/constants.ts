import type { ValidatedVariableInfo } from '@mytypes/configuration';
import { ConfigurationError } from '@utils/config';

import { services, variablesDefaultValues } from './configuration';

// Extract types from actual service configurations
type ExtractTransformType<T> = T extends ValidatedVariableInfo<infer V> ? V : string;

type ExtractAllVariableTypes<T> = T extends { variables: infer V }
  ? { [K in keyof V]: ExtractTransformType<V[K]> }
  : never;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

// Automatically infer all variable types from services
type EnvironmentVariableTypes = UnionToIntersection<
  ExtractAllVariableTypes<(typeof services)[keyof typeof services]>
>;

// Type-safe ENV function with automatic type inference
export function ENV<K extends keyof EnvironmentVariableTypes>(
  variable: K
): EnvironmentVariableTypes[K] {
  try {
    const rawValue = process.env[variable] ?? variablesDefaultValues[variable] ?? '';
    const config = findVariableConfig(variable);

    // Check required fields
    if (!rawValue && config?.required) {
      throw new ConfigurationError(
        `Required environment variable ${variable} is not set`,
        variable
      );
    }

    // Run validation and transform if present
    if (config && 'transform' in config && config.transform && rawValue) {
      const result = config.transform(rawValue);
      if (!result.isValid) {
        let errorMsg = `Invalid value for ${variable}: ${result.error}`;
        errorMsg += `\nCurrent value: "${rawValue}"`;
        if (config.example) errorMsg += `\nExample: ${config.example}`;
        if (result.suggestions?.length) {
          errorMsg += `\nSuggestions: ${result.suggestions.join(', ')}`;
        }
        throw new ConfigurationError(errorMsg, variable);
      }
      return result.value as EnvironmentVariableTypes[K];
    }

    return rawValue as EnvironmentVariableTypes[K];
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(
      `Unexpected error processing ${variable}: ${error instanceof Error ? error.message : String(error)}`,
      variable
    );
  }
}

// Helper to find variable configuration
interface VariableConfig {
  required?: boolean;
  example?: string;
  transform?: (value: string) => {
    isValid: boolean;
    value?: unknown;
    error?: string;
    suggestions?: string[];
  };
}

function findVariableConfig(variableName: string): VariableConfig | undefined {
  for (const service of Object.values(services)) {
    const variables = service.variables as Record<string, VariableConfig>;
    if (variableName in variables) {
      return variables[variableName];
    }
  }
  return undefined;
}
