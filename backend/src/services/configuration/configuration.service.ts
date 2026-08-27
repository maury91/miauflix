import { logger } from '@logger';
import chalk from 'chalk';
import { mkdirSync, readFileSync } from 'fs';
import path from 'path';

import { ConfigurationServiceError } from '@errors/configuration.errors';
import type { ConfigurableService, ServiceInstanceStatus } from '@mytypes/configuration';
import { ALL_VAR_NAMES, services } from '@services/configuration/configuration.consts';
import { EncryptionService } from '@services/encryption/encryption.service';
import { hasKey, objectEntries, objectFromEntries, objectKeys } from '@utils/object.util';

import type {
  ConfigEntryView,
  EnvironmentVariableTypes,
  ExtendedVariableInfo,
  SaveConfigsResult,
  ServiceName,
  ServiceRecovery,
  ServiceStatusEntry,
  TestConfigsResult,
  UpdateConfigsResult,
  VariableName,
} from './configuration.types';
import {
  applyTransform,
  buildAllConfigs,
  computeMissingVarsForGroup,
  configureService,
  getDefaultValue,
  handlerFromInstance,
  isFileDataEntry,
  isNonInteractiveMode,
  isServiceName,
  isValidConfigUpdate,
  persistConfigFile,
  resolveVariableInfo,
  saveToEnvFile,
  validateExistingConfiguration,
} from './configuration.utils';

const ENC_PREFIX = 'enc:';

/*
  Variable source precedence, from higher to lower
  - JSON file
  - ENV variable
  - Default value
 */

export class ConfigurationService {
  /** Post-transform computed values — what get() returns. Populated by precomputeValues(). */
  private _computedValues: Partial<EnvironmentVariableTypes> = {};
  private _encryptionService: EncryptionService | null = null;
  /** On-disk representation of config.json (secrets have enc: prefix) */
  private _fileData: Partial<Record<VariableName, string>> = {};
  private _filePath: string | null = null;
  /** Raw string values: env snapshot + auto-generated + file-loaded + runtime set */
  private _rawValues = new Map<VariableName, string>();
  private _variablesInfo = new Map<VariableName, ExtendedVariableInfo>();
  /** Services that have self-registered with their live instance */
  private _registeredServices = new Map<ServiceName, ConfigurableService>();
  /** Serializes temporary config overlays so concurrent requests cannot see each other's drafts. */
  private _configOperation: Promise<void> = Promise.resolve();

  constructor() {
    for (const [serviceName, service] of objectEntries(services)) {
      const variables = service.variables;
      for (const [variableName, variableConfig] of objectEntries(variables)) {
        this._variablesInfo.set(variableName, {
          ...variableConfig,
          serviceName,
        });
      }
    }
  }

  /**
   * Bootstrap the configuration service:
   * 1. Snapshot process.env + auto-generate skipUserInteraction vars → rawValues
   * 2. Create EncryptionService, create data directory
   * 3. Load config.json — file values overwrite rawValues
   * 4. Pre-compute all transforms
   *
   * Must be called once before any services are initialized.
   * After this, get() is a plain map lookup that cannot throw but can return empty values.
   */
  async init(): Promise<void> {
    this.autoConfigureDefaults();

    // Use rawValues directly for bootstrap — these vars have no transforms
    const securityKey = this._rawValues.get('SOURCE_SECURITY_KEY');
    if (!securityKey) {
      // This should be impossible, this variable has a default value
      throw new ConfigurationServiceError(
        'SOURCE_SECURITY_KEY is missing, cannot continue',
        'missing_required_variable',
        'SOURCE_SECURITY_KEY'
      );
    }
    const dataDir = this._rawValues.get('DATA_DIR');
    if (!dataDir) {
      // This should be impossible, this variable has a default value
      throw new ConfigurationServiceError(
        'DATA_DIR is missing, cannot continue',
        'missing_required_variable',
        'DATA_DIR'
      );
    }
    this._encryptionService = new EncryptionService(securityKey);

    mkdirSync(dataDir, { recursive: true });
    this._filePath = path.join(dataDir, 'config.json');

    this.loadConfigFile();
    this.precomputeValues();
  }

  /**
   * Return the pre-computed value for a config variable.
   * Will not throw, instead it will return undefined
   */
  get<K extends keyof EnvironmentVariableTypes>(
    variable: K
  ): EnvironmentVariableTypes[K] | undefined {
    return this._computedValues[variable];
  }

  /**
   * Return the pre-computed value for a config variable.
   * Can throw if the value is missing
   */
  getOrThrow<K extends keyof EnvironmentVariableTypes>(variable: K): EnvironmentVariableTypes[K] {
    const value = this.get(variable);
    if (value === undefined) {
      throw new ConfigurationServiceError(
        `${variable} is not set.`,
        'missing_required_variable',
        variable as string
      );
    }
    return value;
  }

  /**
   * Pre-compute all transforms after raw values are fully loaded.
   * If the stored value fails validation, falls back to:
   *   A. transform of the default value (if one exists and is valid)
   *   B. empty value
   */
  private precomputeValues(): void {
    const cv = this._computedValues as Record<keyof EnvironmentVariableTypes, unknown>;
    for (const [varName, varInfo] of this._variablesInfo) {
      const raw = this._rawValues.get(varName) ?? '';
      try {
        cv[varName] = applyTransform(varName, varInfo, raw);
      } catch {
        const defaultRaw =
          'defaultValue' in varInfo && varInfo.defaultValue
            ? getDefaultValue(varInfo.defaultValue)
            : '';
        try {
          cv[varName] = applyTransform(varName, varInfo, defaultRaw);
          console.warn(`[Config] ${varName}: stored value is invalid, reverted to default`);
        } catch {
          delete cv[varName];
          console.warn(
            `[Config] ${varName}: stored value is invalid and has no valid default, set to empty`
          );
        }
      }
    }
  }

  /**
   * Snapshot process.env for all known variables and auto-generate skipUserInteraction defaults.
   * Called once at the top of init(), before anything else.
   */
  private autoConfigureDefaults() {
    const autoConfigured = new Set<VariableName>();
    for (const [varName, varInfo] of this._variablesInfo.entries()) {
      // Coming from process.env, maximum precedence in this stage
      if (process.env[varName]) {
        this._rawValues.set(varName, process.env[varName]!);
        // then we fallback to the defaultValue ( if exists )
      } else if ('defaultValue' in varInfo && varInfo.defaultValue) {
        this._rawValues.set(varName, getDefaultValue(varInfo.defaultValue));
        // Variables with `skipUserInteraction` must be saved after being created with a default value
        // these variables are usually random generated passwords or similar, so they must be saved to avoid them changing at every run
        if (varInfo.skipUserInteraction) {
          autoConfigured.add(varName);
        }
      }
    }
    if (autoConfigured.size > 0) {
      saveToEnvFile(
        objectFromEntries([...autoConfigured].map(k => [k, this._rawValues.get(k) ?? '']))
      );
    }
  }

  private loadConfigFile(): void {
    if (!this._filePath || !this._encryptionService) return;
    try {
      const content = readFileSync(this._filePath, 'utf-8');
      const fileData = JSON.parse(content);
      this._fileData = {};
      if (typeof fileData !== 'object' || !fileData) {
        throw new ConfigurationServiceError(
          'configuration file does not contain the right format',
          'invalid_config_file'
        );
      }
      for (const fileDataEntry of Object.entries(fileData)) {
        if (isFileDataEntry(fileDataEntry)) {
          const [key, raw] = fileDataEntry;
          let value = raw;
          if (raw.startsWith(ENC_PREFIX)) {
            try {
              value = this._encryptionService.decryptString(
                raw.slice(ENC_PREFIX.length),
                true,
                false
              );
            } catch {
              logger.warn(
                'Config',
                `${key}: saved encrypted value cannot be decrypted; ignoring it and keeping the current value`
              );
              continue;
            }
          }
          this._rawValues.set(key, value);
          this._fileData[key] = raw; // keep on-disk form (enc:... for secrets, plain otherwise)
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // file doesn't exist yet — start empty
        return;
      }
      throw err;
    }
  }

  private saveConfigFile(): void {
    if (!this._filePath) return;
    persistConfigFile(this._filePath, this._fileData);
  }

  /**
   * Save a config value to rawValues and persist to config.json.
   */
  async setValue<K extends keyof EnvironmentVariableTypes>(
    key: K,
    value: string
  ): Promise<boolean> {
    const previousValue = this._rawValues.get(key);
    if (previousValue === value) {
      return false;
    }

    const varInfo = this._variablesInfo.get(key);
    const transformedValue = varInfo
      ? applyTransform(key, varInfo, value)
      : (value as EnvironmentVariableTypes[K]);

    if (this.get(key) === transformedValue) {
      return false;
    }

    this._rawValues.set(key, value);
    this._computedValues[key] = transformedValue;
    if (this._filePath && this._encryptionService) {
      const { isSecret } = this.findVariableInfo(key);
      this._fileData[key] = isSecret
        ? ENC_PREFIX + this._encryptionService.encryptString(value)
        : value;
      this.saveConfigFile();
    }
    return true;
  }

  /**
   * The TUI configuration wizard. Detects missing/invalid config, prompts the user
   * in interactive mode, saves to config.json, and returns the set of services still
   * needing configuration.
   */
  async runSetup(options: {
    forceReconfigure?: boolean;
    configOnly?: boolean;
  }): Promise<{ servicesNeedingConfiguration: Set<ServiceName> }> {
    const { forceReconfigure = false, configOnly = false } = options;
    const servicesNeedingConfiguration = new Set<ServiceName>();
    const allMissingRequiredVars = new Set<string>();
    const changedVarKeys = new Set<VariableName>();
    const servicesWithMissingVars = new Set<ServiceName>();
    const missingVarsByService = new Map<ServiceName, string[]>();
    let validationErrorsByService: Array<{ serviceKey: ServiceName; error: string }> = [];

    if (forceReconfigure) {
      objectKeys(services).forEach(k => servicesNeedingConfiguration.add(k));
    } else {
      for (const [serviceKey, service] of objectEntries(services)) {
        const missingRequiredVars = objectEntries(service.variables)
          .filter(([varName, varInfo]) => varInfo.required && !this._rawValues.get(varName))
          .map(([varName]) => varName);

        if (missingRequiredVars.length > 0) {
          servicesNeedingConfiguration.add(serviceKey);
          servicesWithMissingVars.add(serviceKey);
          missingVarsByService.set(serviceKey, missingRequiredVars);
          missingRequiredVars.forEach(v => allMissingRequiredVars.add(v));
        }
      }
    }

    if (servicesNeedingConfiguration.size === 0 && !forceReconfigure) {
      console.log(chalk.cyan('Self testing...'));
      const invalidResults = await validateExistingConfiguration(this._registeredServices);
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
      } else {
        console.log(chalk.green('✅ All services are configured correctly!'));
      }
    }

    if (servicesNeedingConfiguration.size > 0 || forceReconfigure) {
      if (isNonInteractiveMode()) {
        if (allMissingRequiredVars.size > 0) {
          const missingByService = Array.from(missingVarsByService.entries())
            .map(([svc, vars]) => `${svc} (${vars.join(', ')})`)
            .join('; ');
          console.warn(
            `[Config] Starting in degraded mode — missing required environment variables for: ${missingByService}. Configure via the admin API or set these in your environment.`
          );
        }
        if (validationErrorsByService.length > 0) {
          const details = validationErrorsByService
            .map(({ serviceKey, error }) => `${serviceKey}: ${error}`)
            .join('; ');
          console.warn(
            `[Config] Starting in degraded mode — validation test failed for: ${details}`
          );
        }
      } else {
        await this.waitForServicesReady(30_000);
        if (forceReconfigure) {
          console.log(chalk.yellow.bold('🔄 Reconfiguring all services as requested.'));
        } else {
          if (servicesWithMissingVars.size > 0) {
            const missingByService = Array.from(missingVarsByService.entries())
              .map(([svc, vars]) => `${svc}: ${vars.join(', ')}`)
              .join('; ');
            console.log(
              chalk.yellow.bold(
                `⚠️  Missing required environment variables for: ${missingByService}`
              )
            );
          }
          if (validationErrorsByService.length > 0) {
            const details = validationErrorsByService
              .map(({ serviceKey, error }) => `${serviceKey}: ${error}`)
              .join('; ');
            console.log(chalk.yellow(`⚠️  Validation test failed for: ${details}`));
          }
        }
        console.log(chalk.cyan("Let's set up your configuration for each service."));

        for (const serviceKey of servicesNeedingConfiguration) {
          const service = services[serviceKey];

          const currentValues = objectFromEntries(
            [...this._variablesInfo.entries()]
              .filter(([, info]) => info.serviceName === serviceKey)
              .map(([varName]) => [varName, this._rawValues.get(varName) ?? ''])
          );

          const registeredInstance = this._registeredServices.get(serviceKey);
          const configuredValues = await configureService(service, {
            currentValues,
            applyValues: async values => {
              for (const [varName, value] of objectEntries(values)) {
                await this.setValue(varName, value);
              }
            },
            handler: registeredInstance ? handlerFromInstance(registeredInstance) : undefined,
            testable: registeredInstance?.testable,
          });

          for (const [varName, prevValue] of objectEntries(currentValues)) {
            if (hasKey(configuredValues, varName)) {
              const newValue = configuredValues[varName];
              if (newValue && newValue !== prevValue) {
                changedVarKeys.add(varName);
              }
            }
          }
        }
      }
    }

    // Persist any auto-configured vars that haven't been saved to file yet
    for (const key of changedVarKeys) {
      const varKey = key;
      const value = this._rawValues.get(varKey);
      if (value) {
        try {
          await this.setValue(varKey, value);
        } catch (error) {
          console.warn(error);
        }
      }
    }

    if (configOnly) {
      console.log(chalk.green.bold('✅ Configuration completed successfully!'));
      console.log(chalk.cyan('Exiting without starting the server as requested.'));
      process.exit(0);
    }

    return { servicesNeedingConfiguration };
  }

  registerService(key: ServiceName, instance: ConfigurableService): void {
    this._registeredServices.set(key, instance);
  }

  async restartService(key: string): Promise<ServiceRecovery | null> {
    // Check if key is a valid service
    if (!isServiceName(key)) {
      throw new ConfigurationServiceError(`Service '${key}' does not exist`, 'service_not_found');
    }

    if (services[key].restartable === false) {
      throw new ConfigurationServiceError(
        `Service '${key}' requires a process restart to apply configuration changes`,
        'service_restart_required'
      );
    }

    const instance = this._registeredServices.get(key);
    if (!instance) {
      throw new ConfigurationServiceError(
        `Service '${key}' is not registered`,
        'service_not_registered'
      );
    }
    const previousStatus = instance.getStatus().status;
    logger.info('Config', `Restarting ${key} (previous status: ${previousStatus})`);
    await instance.reload();

    const status = instance.getStatus();
    if (status.status === 'ready') {
      logger.info('Config', `${key} restart completed: ready`);
      return previousStatus === 'ready' ? null : { service: key, previousStatus };
    }

    logger.warn(
      'Config',
      `${key} restart completed without becoming ready: ${this.serviceStatusMessage(key)}`
    );
    return null;
  }

  getServiceStatuses(): Record<string, ServiceStatusEntry> {
    const result: Record<string, ServiceStatusEntry> = {};
    for (const [key, instance] of this._registeredServices) {
      const status = instance.getStatus();
      switch (status.status) {
        case 'ready':
          result[key] = { status: 'ready' };
          break;
        case 'error': {
          const missingVars = this.getMissingVarsForGroup(key as keyof typeof services);
          result[key] =
            missingVars.length > 0 ? { status: 'needs_configuration', missingVars } : status;
          break;
        }
        default:
          result[key] = status;
      }
    }
    return result;
  }

  async waitForServicesReady(timeoutMs = 30_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const allDone = [...this._registeredServices.values()].every(
        service => !service.getStatus().status.startsWith('initializing')
      );
      if (allDone) return;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  getMissingVarsForGroup(group: keyof typeof services): string[] {
    return computeMissingVarsForGroup(group, this._rawValues);
  }

  private async withConfigLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this._configOperation;
    let release = () => {};
    this._configOperation = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private serviceStatusMessage(serviceName: ServiceName): string {
    const status = this._registeredServices.get(serviceName)?.getStatus();
    if (!status) return `${serviceName} is not registered for a live test.`;
    if (status.status === 'error') return status.errorMessage;
    if (status.status === 'degraded') return status.reason;
    if (status.status !== 'ready') return status.details;
    return `${serviceName} did not become ready.`;
  }

  private async restoreRuntimeServices(serviceNames: Iterable<ServiceName>): Promise<void> {
    for (const serviceName of serviceNames) {
      const instance = this._registeredServices.get(serviceName);
      if (!instance || services[serviceName].restartable === false) continue;
      try {
        const previousStatus = instance.getStatus().status;
        logger.info(
          'Config',
          `Restarting ${serviceName} to restore the previous configuration (previous status: ${previousStatus})`
        );
        await instance.reload();
        if (instance.getStatus().status === 'ready') {
          logger.info('Config', `${serviceName} restoration restart completed: ready`);
        } else {
          logger.warn(
            'Config',
            `${serviceName} restoration restart completed without becoming ready: ${this.serviceStatusMessage(serviceName)}`
          );
        }
      } catch (error) {
        console.warn(
          `[Config] Failed to restore ${serviceName} after a configuration test: ${error instanceof Error ? error.message : error}`
        );
      }
    }
  }

  private async runConfigAction(
    entries: { key: string; value: string }[],
    requestedServices: ServiceName[],
    save: boolean
  ): Promise<SaveConfigsResult | TestConfigsResult> {
    return this.withConfigLock(async () => {
      if (!isValidConfigUpdate(entries)) {
        const unknownKeys = entries
          .map(entry => entry.key)
          .filter(key => !ALL_VAR_NAMES.has(key as VariableName));
        throw new ConfigurationServiceError(
          `Unknown configuration keys: ${unknownKeys.join(', ')}`,
          'unknown_config_key'
        );
      }

      const uniqueServices = [...new Set(requestedServices)];
      for (const { key } of entries) {
        const serviceName = this._variablesInfo.get(key)?.serviceName;
        if (!serviceName || !uniqueServices.includes(serviceName)) {
          throw new ConfigurationServiceError(
            `Configuration key '${key}' does not belong to the requested service`,
            'unknown_config_key',
            key
          );
        }
      }

      const rawSnapshot = new Map(this._rawValues);
      const computedSnapshot = { ...this._computedValues };
      const fileSnapshot = { ...this._fileData };
      const candidateRaw = new Map(this._rawValues);
      const candidateComputed = { ...this._computedValues };
      const submittedValues = new Map(
        entries.map(entry => [entry.key as VariableName, entry.value])
      );
      for (const [key, value] of submittedValues) candidateRaw.set(key, value);

      const results: TestConfigsResult['services'] = [];
      const validServices = new Set<ServiceName>();

      for (const serviceName of uniqueServices) {
        try {
          const missing = computeMissingVarsForGroup(serviceName, candidateRaw);
          if (missing.length > 0) {
            results.push({
              service: serviceName,
              success: false,
              testMode: 'validation',
              message: `Missing required values: ${missing.join(', ')}`,
            });
            continue;
          }

          for (const key of objectKeys(services[serviceName].variables)) {
            const info = this._variablesInfo.get(key as VariableName);
            if (!info) continue;
            candidateComputed[key as keyof EnvironmentVariableTypes] = applyTransform(
              key as VariableName,
              info,
              candidateRaw.get(key as VariableName) ?? ''
            ) as never;
          }
          validServices.add(serviceName);
        } catch (error) {
          results.push({
            service: serviceName,
            success: false,
            testMode: 'validation',
            message: error instanceof Error ? error.message.split('\n')[0] : String(error),
          });
        }
      }

      this._rawValues = candidateRaw;
      this._computedValues = candidateComputed;
      const liveTested = new Set<ServiceName>();
      const previousStatuses = new Map<ServiceName, ServiceInstanceStatus['status']>();

      for (const serviceName of uniqueServices) {
        if (!validServices.has(serviceName)) continue;
        const instance = this._registeredServices.get(serviceName);
        if (!instance?.testable) {
          results.push({
            service: serviceName,
            success: true,
            testMode: 'validation',
            message: `${serviceName} values are valid. A live test is not available for this service.`,
          });
          continue;
        }

        try {
          liveTested.add(serviceName);
          const previousStatus = instance.getStatus().status;
          previousStatuses.set(serviceName, previousStatus);
          logger.info(
            'Config',
            save
              ? `Restarting ${serviceName} to validate the saved configuration (previous status: ${previousStatus})`
              : `Testing ${serviceName} configuration (previous status: ${previousStatus})`
          );
          await instance.reload();
          const ready = instance.getStatus().status === 'ready';
          if (ready) {
            logger.info('Config', `${serviceName} configuration restart completed: ready`);
          } else {
            logger.warn(
              'Config',
              `${serviceName} configuration restart completed without becoming ready: ${this.serviceStatusMessage(serviceName)}`
            );
          }
          results.push({
            service: serviceName,
            success: ready,
            testMode: 'live',
            message: ready
              ? `${serviceName} test successful.`
              : this.serviceStatusMessage(serviceName),
          });
        } catch (error) {
          results.push({
            service: serviceName,
            success: false,
            testMode: 'live',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const success = results.every(result => result.success);
      if (!save || !success) {
        this._rawValues = rawSnapshot;
        this._computedValues = computedSnapshot;
        await this.restoreRuntimeServices(liveTested);
        return save
          ? {
              success,
              services: results,
              restarted: [],
              needsProcessRestart: [],
              changed: [],
              recovered: [],
            }
          : { success, services: results };
      }

      const changedServices = new Set<ServiceName>();
      for (const [key, value] of submittedValues) {
        if (rawSnapshot.get(key) === value) continue;
        const serviceName = this._variablesInfo.get(key)?.serviceName;
        if (serviceName) changedServices.add(serviceName);
        if (this._filePath && this._encryptionService) {
          const { isSecret } = this.findVariableInfo(key);
          this._fileData[key] = isSecret
            ? ENC_PREFIX + this._encryptionService.encryptString(value)
            : value;
        }
      }

      const restarted: ServiceName[] = [];
      const needsProcessRestart: ServiceName[] = [];
      let applyingService: ServiceName | undefined;
      try {
        if (changedServices.size > 0) this.saveConfigFile();
        for (const serviceName of changedServices) {
          applyingService = serviceName;
          if (services[serviceName].restartable === false) {
            needsProcessRestart.push(serviceName);
            continue;
          }
          if (!liveTested.has(serviceName)) {
            const instance = this._registeredServices.get(serviceName);
            if (instance) {
              const previousStatus = instance.getStatus().status;
              previousStatuses.set(serviceName, previousStatus);
              logger.info(
                'Config',
                `Restarting ${serviceName} after configuration was saved (previous status: ${previousStatus})`
              );
              await instance.reload();
              if (instance.getStatus().status === 'ready') {
                logger.info('Config', `${serviceName} restart completed: ready`);
              } else {
                logger.warn(
                  'Config',
                  `${serviceName} restart completed without becoming ready: ${this.serviceStatusMessage(serviceName)}`
                );
              }
            }
          }
          if (this._registeredServices.has(serviceName)) restarted.push(serviceName);
        }
      } catch (error) {
        this._rawValues = rawSnapshot;
        this._computedValues = computedSnapshot;
        this._fileData = fileSnapshot;
        this.saveConfigFile();
        await this.restoreRuntimeServices(changedServices);
        const failedService = applyingService ?? [...changedServices][0];
        if (failedService) {
          const result = results.find(item => item.service === failedService);
          if (result) {
            result.success = false;
            result.message = error instanceof Error ? error.message : String(error);
          }
        }
        return {
          success: false,
          services: results,
          restarted: [],
          needsProcessRestart: [],
          changed: [],
          recovered: [],
        };
      }

      const recovered: ServiceRecovery[] = [...changedServices].flatMap(serviceName => {
        const previousStatus = previousStatuses.get(serviceName);
        const status = this._registeredServices.get(serviceName)?.getStatus().status;
        if (!previousStatus || previousStatus === 'ready' || status !== 'ready') return [];
        logger.info(
          'Config',
          `${serviceName} recovered (${previousStatus} → ready) after configuration was saved`
        );
        return [{ service: serviceName, previousStatus }];
      });

      return {
        success: true,
        services: results,
        restarted,
        needsProcessRestart,
        changed: [...changedServices],
        recovered,
      };
    });
  }

  async testServiceConfigs(
    serviceName: ServiceName,
    entries: { key: string; value: string }[]
  ): Promise<TestConfigsResult> {
    return this.runConfigAction(entries, [serviceName], false) as Promise<TestConfigsResult>;
  }

  async saveServiceConfigs(
    serviceName: ServiceName,
    entries: { key: string; value: string }[]
  ): Promise<SaveConfigsResult> {
    return this.runConfigAction(entries, [serviceName], true) as Promise<SaveConfigsResult>;
  }

  async testAndSaveConfigs(entries: { key: string; value: string }[]): Promise<SaveConfigsResult> {
    if (!isValidConfigUpdate(entries)) {
      return this.runConfigAction(entries, [], true) as Promise<SaveConfigsResult>;
    }
    const serviceNames = entries
      .map(entry => this._variablesInfo.get(entry.key)?.serviceName)
      .filter((serviceName): serviceName is ServiceName => Boolean(serviceName));
    return this.runConfigAction(entries, serviceNames, true) as Promise<SaveConfigsResult>;
  }

  async updateConfigs(entries: { key: string; value: string }[]): Promise<UpdateConfigsResult> {
    if (!isValidConfigUpdate(entries)) {
      const unknownKeys = entries
        .map(e => e.key)
        .filter(key => !ALL_VAR_NAMES.has(key as VariableName));
      throw new ConfigurationServiceError(
        `Unknown configuration keys: ${unknownKeys.join(', ')}`,
        'unknown_config_key'
      );
    }

    // Save values and collect services whose keys actually changed
    const changedServices = new Set<ServiceName>();
    const invalidKeys: string[] = [];
    for (const { key, value } of entries) {
      try {
        const result = await this.setValue(key, value);
        if (result) {
          const info = this._variablesInfo.get(key);
          if (info) {
            changedServices.add(info.serviceName);
          }
        }
      } catch (error) {
        console.warn(
          `[Config] ${key}: invalid value — ${error instanceof Error ? error.message : error}`
        );
        invalidKeys.push(key);
      }
    }
    if (invalidKeys.length > 0) {
      return { success: false, invalidKeys };
    }

    // Restart each affected service
    const restarted: ServiceName[] = [];
    const needsProcessRestart: ServiceName[] = [];

    for (const serviceName of changedServices) {
      if (services[serviceName].restartable === false) {
        needsProcessRestart.push(serviceName);
        continue;
      }
      const instance = this._registeredServices.get(serviceName);
      if (!instance) {
        // Not yet initialized — persisted value will be used on next init
        continue;
      }
      await instance.reload();
      restarted.push(serviceName);
    }

    return { success: true, restarted, needsProcessRestart };
  }

  async getAllConfigs(): Promise<ConfigEntryView[]> {
    return buildAllConfigs(this._rawValues);
  }

  private findVariableInfo(variableName: VariableName): {
    serviceName: string;
    isSecret: boolean;
  } {
    return resolveVariableInfo(variableName, this._variablesInfo);
  }
}
