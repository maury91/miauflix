import { confirm, input, password, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { isatty } from 'tty';

import type {
  ConfigurableService,
  ServiceConfiguration,
  VariableInfo,
} from '@mytypes/configuration';
import { configurationGroups, services } from '@services/configuration/configuration.consts';
import { hasKey, objectEntries, objectFromEntries } from '@utils/object.util';

import type {
  ConfiguredServiceValues,
  SaveConfigsResult,
  ServiceName,
  VariableName,
} from './configuration.types';
import { getDefaultValue, isServiceName } from './configuration.utils';

/*
  The interactive (TTY) configuration wizard run at boot: detects missing or failing
  configuration, prompts for each affected group, and tests the result.
 */

function isNonInteractiveEnvironment() {
  return !isatty(process.stdout.fd);
}

const err = console.error;

export function isNonInteractiveMode() {
  return isNonInteractiveEnvironment();
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
    testable?: boolean;
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
        testable: options.testable,
      });
    }
    throw error;
  }

  if (options.testable === false) {
    return toRecord();
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
      testable: options.testable,
    });
  }

  console.log(chalk.yellow(`Warning: Using potentially invalid configuration for ${service.name}`));
  return toRecord();
}

function getVarOptions(varInfo: VariableInfo): [string, string][] | undefined {
  if ('options' in varInfo && varInfo.options) {
    return Object.entries(varInfo.options).map(([value, description]) => [
      value,
      `${value} - ${description}`,
    ]);
  }
  if ('transform' in varInfo && varInfo.transform && '__boolean' in varInfo.transform) {
    return [
      ['true', 'true'],
      ['false', 'false'],
    ];
  }
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

  if (varInfo.warning) {
    console.log(chalk.yellow(`Warning: ${varInfo.warning}`));
  }

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
    // A secret is not shown as a default, so an empty answer keeps the existing value
    const retainedValue = currentValue || defaultValue;
    const passwordValue = await password({
      message: retainedValue
        ? `Enter ${chalk.cyan(varName)} (leave empty to keep the current value):`
        : `Enter ${chalk.cyan(varName)}:`,
      mask: true,
      validate: input => (!input.trim() && retainedValue ? true : validateInput(input)),
    });

    return passwordValue || currentValue || defaultValue || '';
  }

  const optionEntries = getVarOptions(varInfo);

  if (optionEntries) {
    const optionValues = optionEntries.map(([value]) => value);
    const fallbackValue =
      currentValue && optionValues.includes(currentValue) ? currentValue : defaultValue;

    const selectedValue = await select({
      message: `Select ${chalk.cyan(varName)}:`,
      choices: optionEntries.map(([value, description]) => ({
        name: description,
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
  registeredServices: ReadonlyMap<string, ConfigurableService>,
  /** Groups not to test (e.g. already known to be missing required values). */
  skip: ReadonlySet<string> = new Set()
): Promise<Array<{ serviceKey: ServiceName; error: string }>> {
  const results = await Promise.all(
    objectEntries(services)
      .filter(([serviceKey]) => !skip.has(serviceKey))
      .map(async ([serviceKey]) => {
        const instance = registeredServices.get(serviceKey);
        if (instance && !instance.testable) {
          return { serviceKey, success: true, error: '' };
        }
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

/** What the setup wizard needs from ConfigurationService. */
export interface SetupWizardHost {
  /** Current stored raw value (never a draft). */
  getRawValue(key: VariableName): string | undefined;
  readonly variableGroups: ReadonlyMap<VariableName, string>;
  readonly registeredServices: ReadonlyMap<ServiceName, ConfigurableService>;
  /** True for groups published by remote services: they are saved and tested remotely. */
  isRemoteGroup(groupName: string): boolean;
  saveServiceConfigs(
    groupName: string,
    entries: { key: string; value: string }[]
  ): Promise<SaveConfigsResult>;
  setValue(key: VariableName, value: string): Promise<boolean>;
  waitForServicesReady(timeoutMs: number): Promise<void>;
}

type SetupDiagnosis = {
  servicesNeedingConfiguration: Set<string>;
  missingVarsByService: Map<string, string[]>;
  validationErrorsByService: Array<{ serviceKey: string; error: string }>;
};

/** Required variables without a stored value, by group. */
function findMissingRequiredValues(host: SetupWizardHost): Map<string, string[]> {
  const missingVarsByService = new Map<string, string[]>();
  for (const [serviceKey, service] of objectEntries(configurationGroups)) {
    const missingRequiredVars = objectEntries(service.variables)
      .filter(
        ([varName, varInfo]) => varInfo.required && !host.getRawValue(varName as VariableName)
      )
      .map(([varName]) => varName);
    if (missingRequiredVars.length > 0) missingVarsByService.set(serviceKey, missingRequiredVars);
  }
  return missingVarsByService;
}

/** Groups with a missing required value, plus the other groups whose self-test fails. */
async function diagnoseConfiguration(
  host: SetupWizardHost,
  forceReconfigure: boolean
): Promise<SetupDiagnosis> {
  const servicesNeedingConfiguration = new Set<string>();
  const missingVarsByService = new Map<string, string[]>();
  let validationErrorsByService: SetupDiagnosis['validationErrorsByService'] = [];

  if (forceReconfigure) {
    Object.keys(configurationGroups).forEach(k => servicesNeedingConfiguration.add(k));
    return { servicesNeedingConfiguration, missingVarsByService, validationErrorsByService };
  }

  for (const [serviceKey, missingRequiredVars] of findMissingRequiredValues(host)) {
    servicesNeedingConfiguration.add(serviceKey);
    missingVarsByService.set(serviceKey, missingRequiredVars);
  }

  // Groups with every required value are self-tested even when another group is missing one,
  // so a failing group is reported (and offered for repair) together with the missing values.
  console.log(chalk.cyan('Self testing...'));
  const invalidResults = await validateExistingConfiguration(
    host.registeredServices,
    new Set(servicesNeedingConfiguration)
  );
  if (invalidResults.length > 0) {
    validationErrorsByService = invalidResults;
    const serviceList = invalidResults.map(r => r.serviceKey).join(', ');
    console.log(
      chalk.red(
        `❌ Validation test failed for: ${serviceList}. You will be prompted to reconfigure them.`
      )
    );
    for (const { serviceKey } of invalidResults) {
      servicesNeedingConfiguration.add(serviceKey);
    }
  } else if (servicesNeedingConfiguration.size === 0) {
    console.log(chalk.green('✅ All services are configured correctly!'));
  }
  return { servicesNeedingConfiguration, missingVarsByService, validationErrorsByService };
}

const formatValidationErrors = (errors: SetupDiagnosis['validationErrorsByService']) =>
  errors.map(({ serviceKey, error }) => `${serviceKey}: ${error}`).join('; ');

/** Without a TTY nothing can be prompted: report what is missing and start degraded. */
function warnDegradedStart(diagnosis: SetupDiagnosis): void {
  const { missingVarsByService, validationErrorsByService } = diagnosis;
  if (missingVarsByService.size > 0) {
    const missingByService = Array.from(missingVarsByService.entries())
      .map(([svc, vars]) => `${svc} (${vars.join(', ')})`)
      .join('; ');
    console.warn(
      `[Config] Starting in degraded mode — missing required environment variables for: ${missingByService}. Configure via the admin API or set these in your environment.`
    );
  }
  if (validationErrorsByService.length > 0) {
    console.warn(
      `[Config] Starting in degraded mode — validation test failed for: ${formatValidationErrors(validationErrorsByService)}`
    );
  }
}

function printSetupIntro(diagnosis: SetupDiagnosis, forceReconfigure: boolean): void {
  const { missingVarsByService, validationErrorsByService } = diagnosis;
  if (forceReconfigure) {
    console.log(chalk.yellow.bold('🔄 Reconfiguring all services as requested.'));
  } else {
    if (missingVarsByService.size > 0) {
      const missingByService = Array.from(missingVarsByService.entries())
        .map(([svc, vars]) => `${svc}: ${vars.join(', ')}`)
        .join('; ');
      console.log(
        chalk.yellow.bold(`⚠️  Missing required environment variables for: ${missingByService}`)
      );
    }
    if (validationErrorsByService.length > 0) {
      console.log(
        chalk.yellow(
          `⚠️  Validation test failed for: ${formatValidationErrors(validationErrorsByService)}`
        )
      );
    }
  }
  console.log(chalk.cyan("Let's set up your configuration for each service."));
}

/** Prompts for one group, saving through the normal save path. Returns the keys whose value changed. */
async function promptForGroup(
  host: SetupWizardHost,
  serviceKey: string
): Promise<{ changed: VariableName[]; stillFailing: boolean }> {
  const service = configurationGroups[serviceKey];

  const currentValues = objectFromEntries(
    [...host.variableGroups.entries()]
      .filter(([, groupName]) => groupName === serviceKey)
      .map(([varName]) => [varName, host.getRawValue(varName) ?? ''])
  );

  const registeredInstance = isServiceName(serviceKey)
    ? host.registeredServices.get(serviceKey)
    : undefined;
  const testLocally = registeredInstance && !host.isRemoteGroup(serviceKey);
  const configuredValues = await configureService(service, {
    currentValues,
    applyValues: async values => {
      const result = await host.saveServiceConfigs(
        serviceKey,
        Object.entries(values).map(([key, value]) => ({ key, value: String(value) }))
      );
      if (!result.success) throw new Error(result.services.map(item => item.message).join('; '));
    },
    handler: testLocally ? handlerFromInstance(registeredInstance) : undefined,
    testable: testLocally ? registeredInstance.testable : undefined,
  });

  const changed: VariableName[] = [];
  for (const [varName, prevValue] of objectEntries(currentValues)) {
    if (hasKey(configuredValues, varName)) {
      const newValue = configuredValues[varName];
      if (newValue && newValue !== prevValue) changed.push(varName);
    }
  }
  // The user can keep values whose test failed ("Using potentially invalid configuration").
  // A non-testable service's status does not say whether its configuration works (it may still be
  // initializing), so it is never reported as failing.
  const stillFailing = Boolean(
    testLocally && registeredInstance.testable && !handlerFromInstance(registeredInstance).isAlive()
  );
  return { changed, stillFailing };
}

/**
 * The TUI configuration wizard. Detects missing/invalid config, prompts the user
 * in interactive mode, saves to config.json, and returns the set of services still
 * needing configuration.
 */
export async function runSetupWizard(
  host: SetupWizardHost,
  options: { forceReconfigure?: boolean; configOnly?: boolean }
): Promise<{ servicesNeedingConfiguration: Set<string> }> {
  const { forceReconfigure = false, configOnly = false } = options;
  const diagnosis = await diagnoseConfiguration(host, forceReconfigure);
  const { servicesNeedingConfiguration } = diagnosis;
  const changedVarKeys = new Set<VariableName>();
  /** Groups configured interactively whose service is still not ready afterwards. */
  const leftFailing = new Set<string>();
  const interactive = !isNonInteractiveMode();

  if (servicesNeedingConfiguration.size > 0 || forceReconfigure) {
    if (!interactive) {
      warnDegradedStart(diagnosis);
    } else {
      await host.waitForServicesReady(30_000);
      printSetupIntro(diagnosis, forceReconfigure);
      for (const serviceKey of servicesNeedingConfiguration) {
        const { changed, stillFailing } = await promptForGroup(host, serviceKey);
        for (const key of changed) changedVarKeys.add(key);
        if (stillFailing) leftFailing.add(serviceKey);
      }
    }
  }

  // Persist any auto-configured vars that haven't been saved to file yet
  for (const key of changedVarKeys) {
    const owner = host.variableGroups.get(key);
    if (owner && host.isRemoteGroup(owner)) {
      continue;
    }
    const value = host.getRawValue(key);
    if (value) {
      try {
        await host.setValue(key, value);
      } catch (error) {
        console.warn(error);
      }
    }
  }

  // Report the final state, not the initial diagnosis: values still missing, groups the user
  // kept in a failing state and, without a prompt, groups whose self-test failed.
  const stillNeedingConfiguration = new Set([
    ...findMissingRequiredValues(host).keys(),
    ...leftFailing,
  ]);
  if (!interactive) {
    for (const { serviceKey } of diagnosis.validationErrorsByService) {
      stillNeedingConfiguration.add(serviceKey);
    }
  }

  if (configOnly) {
    if (stillNeedingConfiguration.size > 0) {
      console.error(
        chalk.red.bold(
          `❌ Configuration incomplete for: ${[...stillNeedingConfiguration].join(', ')}`
        )
      );
      process.exit(1);
    }
    console.log(chalk.green.bold('✅ Configuration completed successfully!'));
    console.log(chalk.cyan('Exiting without starting the server as requested.'));
    process.exit(0);
  }

  return { servicesNeedingConfiguration: stillNeedingConfiguration };
}
