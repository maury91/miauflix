import { confirm, input, password, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import path from 'path';
import { isatty } from 'tty';

import { ConfigurationServiceError } from '@errors/configuration.errors';
import type {
  ConfigurableService,
  ServiceConfiguration,
  VariableInfo,
} from '@mytypes/configuration';
import { objectEntries, objectFromEntries } from '@utils/object.util';

import { ALL_SERVICE_NAMES, ALL_VAR_NAMES, services } from './configuration.consts';
import type {
  ConfigEntryView,
  ConfiguredServiceValues,
  EnvironmentVariableTypes,
  ExtendedVariableInfo,
  ServiceName,
  VariableName,
} from './configuration.types';

function isNonInteractiveEnvironment() {
  return !isatty(process.stdout.fd);
}

const err = console.error;

export function isNonInteractiveMode() {
  return isNonInteractiveEnvironment();
}

export function getDefaultValue(defaultValue: string | (() => string)): string {
  return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
}

type ServiceHandler = {
  isAlive: () => boolean;
  reload: () => Promise<void>;
};

function handlerFromInstance(instance: ConfigurableService): ServiceHandler {
  return {
    isAlive: () => instance.getStatus().status === 'ready',
    reload: () => instance.reload(),
  };
}

const testService = async (
  handler?: ServiceHandler,
  skipIfAlive = true
): Promise<{ success: boolean; message?: string }> => {
  if (!handler) {
    return { success: true };
  }
  if (skipIfAlive && handler.isAlive()) {
    return { success: true };
  }
  console.error = () => {};
  try {
    await handler.reload();
    console.error = err;
    return { success: handler.isAlive() };
  } catch (error) {
    console.error = err;
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Configure a service by prompting for variables and testing the configuration.
 * Returns the full map of configured variable values.
 */
export async function configureService<
  S extends ServiceConfiguration<Record<string, VariableInfo>>,
>(
  service: S,
  options: {
    currentValues: Partial<ConfiguredServiceValues<S>>;
    applyValues: (values: ConfiguredServiceValues<S>) => Promise<void>;
    handler?: ServiceHandler;
  }
): Promise<ConfiguredServiceValues<S>> {
  console.log();
  console.log(chalk.cyan.bold(`===== ${service.name} Configuration =====`));
  console.log(chalk.white(service.description));
  console.log();

  // Use a Map to allow generic-keyed writes, convert to Record at boundaries
  const configuredValues = new Map<string, string>();
  const initialValues: Record<string, string | undefined> = options.currentValues;
  for (const [key, value] of objectEntries(initialValues)) {
    if (value !== undefined) {
      configuredValues.set(key, value);
    }
  }

  const toRecord = (): ConfiguredServiceValues<S> =>
    objectFromEntries([...configuredValues]) as ConfiguredServiceValues<S>;

  // Get variables by required state
  const optionalVars = objectEntries(service.variables)
    .filter(([, info]) => !info.required)
    .map(([name]) => name);

  const requiredVars = objectEntries(service.variables)
    .filter(([, info]) => info.required)
    .map(([name]) => name);

  // Handle optional variables
  for (const varName of optionalVars) {
    const varInfo = service.variables[varName];
    configuredValues.set(
      varName,
      await promptForVariable(varName, varInfo, true, configuredValues.get(varName) ?? '')
    );
  }

  // Handle required variables
  for (const varName of requiredVars) {
    const varInfo = service.variables[varName];
    configuredValues.set(
      varName,
      await promptForVariable(varName, varInfo, false, configuredValues.get(varName) ?? '')
    );
  }

  try {
    await options.applyValues(toRecord());
  } catch (error) {
    console.warn(error);
    const tryAgain = await confirm({
      message: `Would you like to reconfigure ${service.name}?`,
      default: true,
    });

    if (tryAgain) {
      return configureService(service, {
        currentValues: toRecord(),
        applyValues: options.applyValues,
        handler: options.handler,
      });
    }
  }

  // Test the configuration — always re-test after config change (skipIfAlive=false)
  console.log(chalk.yellow(`\nTesting ${service.name} configuration...`));
  const testResult = await testService(options.handler, false);

  if (testResult.success) {
    console.log(chalk.green(`✅ ${service.name} configuration is valid!`));
    return toRecord();
  }

  console.log(chalk.red(`❌ ${service.name} configuration failed: ${testResult.message}`));

  const tryAgain = await confirm({
    message: `Would you like to reconfigure ${service.name}?`,
    default: true,
  });

  if (tryAgain) {
    return configureService(service, {
      currentValues: toRecord(),
      applyValues: options.applyValues,
      handler: options.handler,
    });
  }

  console.log(chalk.yellow(`Warning: Using potentially invalid configuration for ${service.name}`));
  return toRecord();
}

/**
 * Prompt user for a single environment variable
 */
async function promptForVariable(
  varName: string,
  varInfo: VariableInfo,
  optional: boolean,
  existingValue?: string
): Promise<string> {
  const defaultValue =
    'defaultValue' in varInfo && varInfo.defaultValue ? getDefaultValue(varInfo.defaultValue) : '';
  const currentValue = existingValue || defaultValue;

  console.log();
  console.log(
    chalk.cyan.bold(`${varName}:`) + chalk.dim(` (${optional ? 'optional' : 'required'})`)
  );
  console.log(chalk.white(varInfo.description));

  if ('defaultValue' in varInfo) {
    console.log(chalk.dim(`Default: ${defaultValue}`));
  }

  if (varInfo.example) {
    console.log(chalk.dim(`Example: ${varInfo.example}`));
  }

  if (varInfo.link) {
    console.log(`You can get this from: ${varInfo.link}`);
  }

  if ('options' in varInfo && varInfo.options) {
    const optionDescriptions = Object.entries(varInfo.options)
      .map(([value, description]) => `${value}: ${description}`)
      .join(' | ');
    console.log(chalk.dim(`Options: ${optionDescriptions}`));
  }

  // Enhanced validation function
  const validateInput = async (input: string): Promise<string | true> => {
    // Basic required validation
    if (!input.trim() && varInfo.required) {
      return `${varName} is required`;
    }

    // Skip validation for empty optional fields
    if (!input.trim() && !varInfo.required) {
      return true;
    }

    // Run custom validation if present
    if ('transform' in varInfo && varInfo.transform && input.trim()) {
      const result = varInfo.transform(input);
      if (!result.isValid) {
        let errorMsg = result.error!;
        if (result.suggestions?.length) {
          errorMsg += `\n${chalk.dim('Suggestions:')} ${result.suggestions.join(', ')}`;
        }
        return errorMsg;
      }
    }

    return true;
  };

  if ('password' in varInfo && varInfo.password) {
    const passwordValue = await password({
      message: `Enter ${chalk.cyan(varName)}:`,
      mask: true,
      validate: validateInput,
    });

    return passwordValue || defaultValue || '';
  }

  if ('options' in varInfo && varInfo.options) {
    const optionEntries = Object.entries(varInfo.options);
    const optionValues = optionEntries.map(([value]) => value);
    const fallbackValue =
      currentValue && optionValues.includes(currentValue) ? currentValue : undefined;

    const selectedValue = await select({
      message: `Select ${chalk.cyan(varName)}:`,
      choices: optionEntries.map(([value, description]) => ({
        name: `${value} - ${description}`,
        value,
      })),
      default: fallbackValue,
    });

    return selectedValue || defaultValue || '';
  }

  const value = await input({
    message: `Enter ${chalk.cyan(varName)}:`,
    default: currentValue,
    validate: validateInput,
  });

  return value || defaultValue || '';
}

/**
 * Validate existing configuration; returns services that failed the test with their error message.
 * For registered services, skips the test if the service is already alive.
 */
export async function validateExistingConfiguration(
  registeredServices: Map<string, ConfigurableService>
): Promise<Array<{ serviceKey: ServiceName; error: string }>> {
  const results = await Promise.all(
    objectEntries(services).map(async ([serviceKey]) => {
      const instance = registeredServices.get(serviceKey);
      const handler = instance ? handlerFromInstance(instance) : undefined;
      const testResult = await testService(handler, true);
      return {
        serviceKey,
        success: testResult.success,
        error: testResult.message ?? 'Not ready',
      };
    })
  );
  return results.filter(r => !r.success).map(({ serviceKey, error }) => ({ serviceKey, error }));
}

export { handlerFromInstance };
export type { ServiceHandler };

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
  const envFilePath = path.resolve(process.cwd(), '.env');
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
function maskValue(value: string): string {
  if (!value) return '****';
  if (value.length <= 4) return '****';
  return value.slice(0, 4) + '****';
}

function isSecretVariable(varInfo: VariableInfo): boolean {
  return 'password' in varInfo && varInfo.password === true;
}

export function isServiceName(name: string): name is ServiceName {
  return ALL_SERVICE_NAMES.has(name as ServiceName);
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
  group: keyof typeof services,
  rawValues: Map<VariableName, string>
): string[] {
  const service = services[group];
  if (!service) return [];
  return objectEntries(service.variables)
    .filter(([varName, varInfo]) => {
      if ('skipUserInteraction' in varInfo && varInfo.skipUserInteraction) return false;
      if (!varInfo.required) return false;
      return !rawValues.get(varName);
    })
    .map(([varName]) => varName);
}

export function buildAllConfigs(rawValues: Map<VariableName, string>): ConfigEntryView[] {
  const result: ConfigEntryView[] = [];
  for (const [groupKey, service] of objectEntries(services)) {
    for (const [varName, varInfo] of objectEntries(service.variables)) {
      const rawValue = rawValues.get(varName) ?? '';
      const isSecret = isSecretVariable(varInfo);
      result.push({
        key: varName,
        value: isSecret ? maskValue(rawValue) : rawValue,
        isSecret,
        serviceGroup: groupKey,
        description: varInfo.description,
        required: varInfo.required,
        hasValue: rawValue.length > 0,
      });
    }
  }
  return result;
}

export function resolveVariableInfo(
  variableName: VariableName,
  variablesInfo: Map<VariableName, ExtendedVariableInfo>
): { serviceName: string; isSecret: boolean } {
  const variableInfo = variablesInfo.get(variableName);
  if (variableInfo) {
    return { serviceName: variableInfo.serviceName, isSecret: isSecretVariable(variableInfo) };
  }
  return { serviceName: 'UNKNOWN', isSecret: false };
}
