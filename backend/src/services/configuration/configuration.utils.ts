import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import path from 'path';

import { ConfigurationServiceError } from '@errors/configuration.errors';
import type { VariableInfo } from '@mytypes/configuration';
import { objectEntries } from '@utils/object.util';

import {
  ALL_CONFIG_GROUP_NAMES,
  ALL_SERVICE_NAMES,
  ALL_VAR_NAMES,
  configurationGroups,
} from './configuration.consts';
import type {
  ConfigEntryView,
  EnvironmentVariableTypes,
  ExtendedVariableInfo,
  ServiceName,
  VariableName,
} from './configuration.types';

export function getDefaultValue(defaultValue: string | (() => string)): string {
  return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
}

/**
 * Apply the transform defined on a variable's info to a raw string value.
 * Throws ConfigurationServiceError if the transform rejects the value.
 * Pure function — no instance state.
 */
export function applyTransform<K extends keyof EnvironmentVariableTypes>(
  varName: K,
  varInfo: VariableInfo,
  rawValue: string
): EnvironmentVariableTypes[K] {
  if ('transform' in varInfo && varInfo.transform && rawValue) {
    const result = varInfo.transform(rawValue);
    if (!result.isValid) {
      let msg = `Invalid value for ${varName}: ${result.error}\nCurrent value: "${rawValue}"`;
      if (varInfo.example) msg += `\nExample: ${varInfo.example}`;
      if (result.suggestions?.length) msg += `\nSuggestions: ${result.suggestions.join(', ')}`;
      throw new ConfigurationServiceError(msg, 'invalid_variable_value', varName as string);
    }
    return result.value as EnvironmentVariableTypes[K];
  }
  return rawValue as EnvironmentVariableTypes[K];
}

/**
 * Persist variables to the .env file, updating existing keys in-place.
 * Pure function — no instance state.
 */
export function saveToEnvFile(vars: Record<VariableName, string>): void {
  const currentDirectory = process.cwd();
  const envFilePath = path.resolve(
    currentDirectory,
    path.basename(currentDirectory) === 'backend' ? '../.env' : '.env'
  );
  let envContent = '';
  try {
    if (existsSync(envFilePath)) {
      envContent = readFileSync(envFilePath, 'utf-8');
    }
  } catch {
    // start fresh
  }
  for (const [key, value] of objectEntries(vars)) {
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `${key}=${value}\n`;
    }
  }
  writeFileSync(envFilePath, envContent, 'utf-8');
}

/**
 * Type guard: returns true if every entry key is a known VariableName.
 * Pure function — no instance state.
 */
export function isValidConfigUpdate(
  entries: { key: string; value: string }[]
): entries is { key: VariableName; value: string }[] {
  return entries.every(e => ALL_VAR_NAMES.has(e.key as VariableName));
}

/** Throws `unknown_config_key` naming every entry key that is not a known VariableName. */
export function assertKnownConfigKeys(
  entries: { key: string; value: string }[]
): asserts entries is { key: VariableName; value: string }[] {
  if (isValidConfigUpdate(entries)) return;
  const unknownKeys = entries
    .map(entry => entry.key)
    .filter(key => !ALL_VAR_NAMES.has(key as VariableName));
  throw new ConfigurationServiceError(
    `Unknown configuration keys: ${unknownKeys.join(', ')}`,
    'unknown_config_key'
  );
}
function maskValue(value: string): string {
  if (!value) return '****';
  if (value.length <= 4) return '****';
  return value.slice(0, 4) + '****';
}

function isSecretVariable(varInfo: VariableInfo): boolean {
  return 'password' in varInfo && varInfo.password === true;
}

function getConfigInputMetadata(
  varInfo: VariableInfo
): Pick<ConfigEntryView, 'inputType' | 'numberOptions' | 'options' | 'sizeUnits' | 'timeUnits'> {
  if ('options' in varInfo && varInfo.options) {
    return { inputType: 'select', options: { ...varInfo.options } };
  }

  const metadata = 'transform' in varInfo ? varInfo.transform?.__configInput : undefined;
  if (!metadata) return { inputType: 'text' };

  if (metadata.type === 'number') {
    return {
      inputType: 'number',
      numberOptions: {
        min: metadata.min,
        max: metadata.max,
        integer: metadata.integer,
      },
    };
  }

  if (metadata.type === 'size') {
    return { inputType: 'size', sizeUnits: metadata.units ? [...metadata.units] : [] };
  }

  if (metadata.type === 'time') {
    return { inputType: 'time', timeUnits: metadata.units ? [...metadata.units] : [] };
  }

  return { inputType: metadata.type };
}

export function isServiceName(name: string): name is ServiceName {
  return ALL_SERVICE_NAMES.has(name as ServiceName);
}

export function isConfigGroupName(name: string): boolean {
  return ALL_CONFIG_GROUP_NAMES.has(name);
}

export function isFileDataEntry(entry: [string, unknown]): entry is [VariableName, string] {
  return ALL_VAR_NAMES.has(entry[0] as VariableName) && typeof entry[1] === 'string';
}

export function persistConfigFile(
  filePath: string,
  fileData: Partial<Record<VariableName, string>>
): void {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, JSON.stringify(fileData, null, 2), 'utf-8');
  renameSync(tmp, filePath);
}

export function computeMissingVarsForGroup(
  group: string,
  rawValues: ReadonlyMap<VariableName, string>
): string[] {
  const service = configurationGroups[group];
  if (!service) return [];
  return objectEntries(service.variables)
    .filter(([varName, varInfo]) => {
      if ('skipUserInteraction' in varInfo && varInfo.skipUserInteraction) return false;
      if (!varInfo.required) return false;
      return !rawValues.get(varName as VariableName);
    })
    .map(([varName]) => varName);
}

export function buildAllConfigs(rawValues: ReadonlyMap<VariableName, string>): ConfigEntryView[] {
  const result: ConfigEntryView[] = [];
  for (const [groupKey, service] of objectEntries(configurationGroups)) {
    for (const [varName, varInfo] of objectEntries(service.variables)) {
      const rawValue = rawValues.get(varName as VariableName) ?? '';
      const isSecret = isSecretVariable(varInfo);
      result.push({
        key: varName,
        value: isSecret ? maskValue(rawValue) : rawValue,
        isSecret,
        serviceGroup: groupKey,
        serviceDescription: service.description,
        description: varInfo.description,
        label: varInfo.label,
        defaultValueSource: varInfo.defaultValueSource,
        required: varInfo.required,
        advanced: varInfo.advanced,
        warning: varInfo.warning,
        hasValue: rawValue.length > 0,
        ...getConfigInputMetadata(varInfo),
        booleanStateDescriptions: varInfo.booleanStateDescriptions,
        link: varInfo.link,
        linkLabel: varInfo.linkLabel,
        testRelevant: varInfo.testRelevant,
        testFailureHelp: varInfo.testFailureHelp,
        example: varInfo.example,
      });
    }
  }
  return result;
}

export function resolveVariableInfo(
  variableName: VariableName,
  variablesInfo: ReadonlyMap<VariableName, ExtendedVariableInfo>
): { serviceName: string; isSecret: boolean } {
  const variableInfo = variablesInfo.get(variableName);
  if (variableInfo) {
    return { serviceName: variableInfo.serviceName, isSecret: isSecretVariable(variableInfo) };
  }
  return { serviceName: 'UNKNOWN', isSecret: false };
}
