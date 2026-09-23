import { logger } from '@logger';
import type { ConfigVariable, ServiceConfigSchema } from '@miauflix/service-contracts';
import { ConfigStore } from '@miauflix/service-contracts';
import chalk from 'chalk';
import { mkdirSync } from 'fs';
import path from 'path';

import { ConfigurationServiceError } from '@errors/configuration.errors';
import type { ConfigurableService, ServiceInstanceStatus } from '@mytypes/configuration';
import type { VariableInfo } from '@mytypes/configuration';
import {
  ALL_VAR_NAMES,
  type ConfigurationGroup,
  configurationGroups,
  replaceRemoteServiceGroups,
  services,
} from '@services/configuration/configuration.consts';
import { EncryptionService } from '@services/encryption/encryption.service';
import { transforms, variable } from '@utils/config';
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
  isNonInteractiveMode,
  isServiceName,
  isValidConfigUpdate,
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
  private _configStore: ConfigStore | null = null;
  /** Raw string values: env snapshot + auto-generated + file-loaded + runtime set */
  private _rawValues = new Map<VariableName, string>();
  private _variablesInfo = new Map<VariableName, ExtendedVariableInfo>();
  private _variableGroups = new Map<VariableName, string>();
  /** Variables whose values are owned and interpreted by this Backend process. */
  private readonly _localVariableNames = new Set<VariableName>();
  private readonly _managedVariableNames = new Set<VariableName>();
  /** Names currently published by each runtime-registered service. */
  private _dynamicVariableNames = new Map<ServiceName, Set<VariableName>>();
  private _remoteSchemas = new Map<ServiceName, ServiceConfigSchema>();
  /** Services that have self-registered with their live instance */
  private _registeredServices = new Map<ServiceName, ConfigurableService>();
  /** Serializes temporary config overlays so concurrent requests cannot see each other's drafts. */
  private _configOperation: Promise<void> = Promise.resolve();
  private readonly _changeListeners = new Set<() => void>();

  constructor() {
    for (const [serviceName, service] of objectEntries(services)) {
      const variables = service.variables;
      for (const [variableName, variableConfig] of objectEntries(variables)) {
        this._variablesInfo.set(variableName, {
          ...variableConfig,
          serviceName,
        });
        this._variableGroups.set(variableName, serviceName);
        this._localVariableNames.add(variableName);
        this._managedVariableNames.add(variableName);
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
    this._configStore = new ConfigStore({ filePath: this._filePath });

    this.loadConfigFile();
    this.precomputeValues();
  }

  /**
   * Registers runtime-declared variables (e.g. a remote service's published
   * schema) after init(). Remote values are deliberately not loaded: the remote
   * service owns and decrypts them. The schema is retained for wizard metadata
   * and request routing only.
   */
  registerRemoteConfiguration(serviceName: ServiceName, schema: ServiceConfigSchema): void {
    const groups: Record<string, ConfigurationGroup> = {};
    for (const group of schema.groups) {
      groups[group.id] = {
        name: group.name,
        description: group.description,
        variables: Object.fromEntries(
          group.variables.map(item => [item.key, this.remoteVariableInfo(item)])
        ),
      };
    }
    replaceRemoteServiceGroups(serviceName, groups);
    this._remoteSchemas.set(serviceName, schema);
    const keys = new Set(
      schema.groups.flatMap(group => group.variables.map(item => item.key as VariableName))
    );
    for (const key of keys) {
      this._managedVariableNames.add(key);
      const group = schema.groups.find(candidate =>
        candidate.variables.some(item => item.key === key)
      )!;
      const item = group.variables.find(candidate => candidate.key === key)!;
      const existing = this._variablesInfo.get(key);
      this._variablesInfo.set(key, {
        ...this.remoteVariableInfo(item),
        serviceName,
      });
      this._variableGroups.set(key, group.id);
      if (!this._rawValues.has(key)) {
        const envValue = process.env[key];
        const defaultValue = item.defaultValue ?? '';
        const value = envValue || defaultValue;
        if (value) this._rawValues.set(key, value);
      }
      if (!existing && this._rawValues.has(key)) {
        const info = this._variablesInfo.get(key)!;
        (this._computedValues as Record<string, unknown>)[key] = applyTransform(
          key as never,
          info,
          this._rawValues.get(key)!
        );
      }
    }
    const previous = this._dynamicVariableNames.get(serviceName) ?? new Set<VariableName>();
    const active = new Set(keys);
    for (const key of previous) {
      if (
        !active.has(key) &&
        ![...this._remoteSchemas.entries()].some(
          ([owner, candidate]) =>
            owner !== serviceName &&
            candidate.groups.some(group => group.variables.some(item => item.key === key))
        )
      ) {
        this._variablesInfo.delete(key);
        delete (this._computedValues as Record<string, unknown>)[key];
      }
    }
    this._dynamicVariableNames.set(serviceName, keys);
  }

  getServiceConfigSnapshot(
    serviceName: ServiceName,
    overrides: Record<string, string> = {}
  ): Record<string, string> | undefined {
    const schema = this._remoteSchemas.get(serviceName);
    if (!schema) return undefined;
    const variables = schema.groups.flatMap(group => group.variables);
    const values = Object.fromEntries(
      variables.map(item => [
        item.key,
        overrides[item.key] ??
          this._rawValues.get(item.key as VariableName) ??
          item.defaultValue ??
          '',
      ])
    );
    if (variables.some(item => item.required && !values[item.key])) return undefined;
    return values;
  }

  private remoteVariableInfo(item: ConfigVariable): VariableInfo {
    const common = {
      description: item.description,
      label: item.label,
      required: item.required,
      advanced: item.advanced,
      defaultValueSource: item.defaultValueSource,
      example: item.example,
      link: item.link,
      linkLabel: item.linkLabel,
      testRelevant: item.testRelevant,
      testFailureHelp: item.testFailureHelp,
      booleanStateDescriptions: item.booleanStateDescriptions,
    };
    switch (item.inputType) {
      case 'password':
        return item.skipUserInteraction && item.defaultValue
          ? variable({
              ...common,
              password: true,
              defaultValue: item.defaultValue,
              skipUserInteraction: true,
            })
          : variable({ ...common, password: true });
      case 'select':
        return variable({
          ...common,
          defaultValue: item.defaultValue,
          options: item.options ?? {},
          transform: transforms.enum({ values: Object.keys(item.options ?? {}) }),
        });
      case 'boolean':
        return variable({
          ...common,
          defaultValue: item.defaultValue ?? 'false',
          transform: transforms.boolean(),
        });
      case 'number':
        return variable({
          ...common,
          defaultValue: item.defaultValue ?? '0',
          transform: transforms.number(item.numberOptions ?? {}),
        });
      default:
        return variable({
          ...common,
          defaultValue: item.defaultValue ?? '',
          transform: transforms.string(),
        });
    }
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

  /** Runtime lookup for namespaced variables published by remote services. */
  getDynamic(variable: string): unknown {
    return (this._computedValues as Record<string, unknown>)[variable];
  }

  /**
   * Pre-compute all transforms after raw values are fully loaded.
   * If the stored value fails validation, falls back to:
   *   A. transform of the default value (if one exists and is valid)
   *   B. empty value
   */
  private precomputeValues(): void {
    const cv = this._computedValues as Record<keyof EnvironmentVariableTypes, unknown>;
    for (const varName of this._localVariableNames) {
      const varInfo = this._variablesInfo.get(varName);
      if (!varInfo) continue;
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
  private autoConfigureDefaults(
    variableNames: Iterable<VariableName> = this._variablesInfo.keys()
  ) {
    const autoConfigured = new Set<VariableName>();
    for (const varName of variableNames) {
      const varInfo = this._variablesInfo.get(varName);
      if (!varInfo || this._rawValues.has(varName)) continue;

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
    if (!this._configStore || !this._encryptionService) return;
    this._fileData = {};
    const fileData = this._configStore.readAllSync();
    for (const [key, raw] of Object.entries(fileData)) {
      this._fileData[key as VariableName] = raw;
      let value = raw;
      if (raw.startsWith(ENC_PREFIX)) {
        try {
          value = this._encryptionService.decryptString(raw.slice(ENC_PREFIX.length), true, false);
        } catch {
          logger.warn(
            'Config',
            `${key}: saved encrypted value cannot be decrypted; ignoring it and keeping the current value`
          );
          continue;
        }
      }
      this._rawValues.set(key as VariableName, value);
    }
  }

  private async saveConfigFile(): Promise<void> {
    if (!this._configStore) return;
    const values = Object.fromEntries(
      [...this._managedVariableNames]
        .map(key => [key, this._fileData[key]])
        .filter(
          (entry): entry is [VariableName, string] =>
            typeof entry[1] === 'string' && entry[1].length > 0
        )
    );
    const unsetKeys = [...this._managedVariableNames].filter(key => !(key in values));
    const stored = await this._configStore.update(this._managedVariableNames, {
      values,
      unsetKeys,
    });
    for (const key of unsetKeys) delete this._fileData[key];
    for (const [key, value] of Object.entries(stored)) this._fileData[key as VariableName] = value;
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
      await this.saveConfigFile();
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
  }): Promise<{ servicesNeedingConfiguration: Set<string> }> {
    const { forceReconfigure = false, configOnly = false } = options;
    const servicesNeedingConfiguration = new Set<string>();
    const allMissingRequiredVars = new Set<string>();
    const changedVarKeys = new Set<VariableName>();
    const servicesWithMissingVars = new Set<string>();
    const missingVarsByService = new Map<string, string[]>();
    let validationErrorsByService: Array<{ serviceKey: string; error: string }> = [];

    if (forceReconfigure) {
      Object.keys(configurationGroups).forEach(k => servicesNeedingConfiguration.add(k));
    } else {
      for (const [serviceKey, service] of objectEntries(configurationGroups)) {
        const missingRequiredVars = objectEntries(service.variables)
          .filter(
            ([varName, varInfo]) =>
              varInfo.required && !this._rawValues.get(varName as VariableName)
          )
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
          const service = configurationGroups[serviceKey];

          const currentValues = objectFromEntries(
            [...this._variableGroups.entries()]
              .filter(([, groupName]) => groupName === serviceKey)
              .map(([varName]) => [varName, this._rawValues.get(varName) ?? ''])
          );

          const registeredInstance = isServiceName(serviceKey)
            ? this._registeredServices.get(serviceKey)
            : undefined;
          const configuredValues = await configureService(service, {
            currentValues,
            applyValues: async values => {
              const result = await this.saveServiceConfigs(
                serviceKey,
                Object.entries(values).map(([key, value]) => ({ key, value: String(value) }))
              );
              if (!result.success)
                throw new Error(result.services.map(item => item.message).join('; '));
            },
            handler:
              registeredInstance && this.remoteConsumersForGroup(serviceKey).length === 0
                ? handlerFromInstance(registeredInstance)
                : undefined,
            testable:
              registeredInstance && this.remoteConsumersForGroup(serviceKey).length === 0
                ? registeredInstance.testable
                : undefined,
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
      const owner = this._variableGroups.get(key);
      if (owner && this.remoteConsumersForGroup(owner).length) {
        continue;
      }
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

  subscribeChanges(listener: () => void): () => void {
    this._changeListeners.add(listener);
    return () => this._changeListeners.delete(listener);
  }

  private notifyChanges(): void {
    for (const listener of this._changeListeners) {
      try {
        listener();
      } catch (error) {
        logger.warn('Config', 'A configuration change listener failed', error);
      }
    }
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
      this.notifyChanges();
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
    const remoteSchema = this._remoteSchemas.get(group);
    if (remoteSchema) {
      return remoteSchema.groups
        .flatMap(remoteGroup => remoteGroup.variables)
        .filter(
          item =>
            item.required && !this._rawValues.get(item.key as VariableName) && !item.defaultValue
        )
        .map(item => item.key);
    }
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
        const serviceName = this._variableGroups.get(key);
        if (!serviceName || !uniqueServices.includes(serviceName as ServiceName)) {
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
          const observationalTest = !save ? instance.testConfiguration : undefined;
          let ready: boolean;
          let message: string | undefined;
          if (observationalTest) {
            logger.info(
              'Config',
              `Testing ${serviceName} configuration without applying the draft`
            );
            const test = await observationalTest.call(instance);
            ready = test.success;
            message = test.message;
          } else {
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
            ready = instance.getStatus().status === 'ready';
            message = ready ? undefined : this.serviceStatusMessage(serviceName);
          }
          if (ready) {
            logger.info('Config', `${serviceName} configuration restart completed: ready`);
          } else {
            logger.warn(
              'Config',
              `${serviceName} configuration test failed: ${message ?? this.serviceStatusMessage(serviceName)}`
            );
          }
          results.push({
            service: serviceName,
            success: ready,
            testMode: 'live',
            message: ready
              ? (message ?? `${serviceName} test successful.`)
              : (message ?? this.serviceStatusMessage(serviceName)),
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
        if (changedServices.size > 0) await this.saveConfigFile();
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
        await this.saveConfigFile();
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

      const result = {
        success: true,
        services: results,
        restarted,
        needsProcessRestart,
        changed: [...changedServices],
        recovered,
      };
      if (changedServices.size > 0) this.notifyChanges();
      return result;
    });
  }

  async testServiceConfigs(
    serviceName: string,
    entries: { key: string; value: string }[]
  ): Promise<TestConfigsResult> {
    const consumers = this.remoteConsumersForGroup(serviceName);
    if (consumers.length) {
      return this.runRemoteGroupConfigAction(
        serviceName,
        entries,
        false
      ) as Promise<TestConfigsResult>;
    }
    if (!isServiceName(serviceName))
      throw new ConfigurationServiceError(
        `Configuration group '${serviceName}' does not exist`,
        'service_not_found'
      );
    return this.runConfigAction(entries, [serviceName], false) as Promise<TestConfigsResult>;
  }

  async saveServiceConfigs(
    serviceName: string,
    entries: { key: string; value: string }[]
  ): Promise<SaveConfigsResult> {
    const consumers = this.remoteConsumersForGroup(serviceName);
    if (consumers.length) {
      return this.runRemoteGroupConfigAction(
        serviceName,
        entries,
        true
      ) as Promise<SaveConfigsResult>;
    }
    if (!isServiceName(serviceName))
      throw new ConfigurationServiceError(
        `Configuration group '${serviceName}' does not exist`,
        'service_not_found'
      );
    return this.runConfigAction(entries, [serviceName], true) as Promise<SaveConfigsResult>;
  }

  async testAndSaveConfigs(entries: { key: string; value: string }[]): Promise<SaveConfigsResult> {
    if (!isValidConfigUpdate(entries)) {
      return this.runConfigAction(entries, [], true) as Promise<SaveConfigsResult>;
    }
    const serviceNames = entries
      .map(entry => this._variableGroups.get(entry.key))
      .filter((groupName): groupName is string => Boolean(groupName));
    if (
      serviceNames.every(
        serviceName =>
          this.remoteConsumersForGroup(serviceName).length === 0 && isServiceName(serviceName)
      )
    ) {
      return this.runConfigAction(
        entries,
        [...new Set(serviceNames.filter(isServiceName))],
        true
      ) as Promise<SaveConfigsResult>;
    }
    const grouped = new Map<string, { key: string; value: string }[]>();
    for (const entry of entries) {
      const groupName = this._variableGroups.get(entry.key);
      if (!groupName) continue;
      grouped.set(groupName, [...(grouped.get(groupName) ?? []), entry]);
    }
    const results = await Promise.all(
      [...grouped.entries()].map(([groupName, groupEntries]) =>
        this.remoteConsumersForGroup(groupName).length
          ? this.runRemoteGroupConfigAction(groupName, groupEntries, true)
          : isServiceName(groupName)
            ? this.runConfigAction(groupEntries, [groupName], true)
            : Promise.resolve({
                success: false,
                services: [],
                restarted: [],
                needsProcessRestart: [],
                changed: [],
                recovered: [],
              })
      )
    );
    const services = results.flatMap(result => result.services);
    return {
      success: results.every(result => result.success),
      services,
      restarted: results.flatMap(result => ('restarted' in result ? result.restarted : [])),
      needsProcessRestart: results.flatMap(result =>
        'needsProcessRestart' in result ? result.needsProcessRestart : []
      ),
      changed: results.flatMap(result => ('changed' in result ? result.changed : [])),
      recovered: results.flatMap(result => ('recovered' in result ? result.recovered : [])),
    };
  }

  private async runRemoteConfigAction(
    groupName: string,
    entries: { key: string; value: string }[],
    save: boolean
  ): Promise<SaveConfigsResult | TestConfigsResult> {
    return this.runRemoteGroupConfigAction(groupName, entries, save);
  }

  private remoteConsumersForGroup(groupName: string): ServiceName[] {
    return [...this._remoteSchemas.entries()]
      .filter(([, schema]) => schema.groups.some(group => group.id === groupName))
      .map(([serviceName]) => serviceName);
  }

  private async runRemoteGroupConfigAction(
    groupName: string,
    entries: { key: string; value: string }[],
    save: boolean
  ): Promise<SaveConfigsResult | TestConfigsResult> {
    return this.withConfigLock(async () => {
      const group = configurationGroups[groupName];
      const consumers = this.remoteConsumersForGroup(groupName);
      if (!group || consumers.length === 0) {
        throw new ConfigurationServiceError(
          `Configuration group '${groupName}' does not exist`,
          'service_not_found'
        );
      }
      const invalidKeys = entries.filter(({ key }) => !group.variables[key]).map(({ key }) => key);
      for (const { key, value } of entries) {
        if (invalidKeys.includes(key) || !value) continue;
        try {
          applyTransform(key as never, group.variables[key], value);
        } catch {
          invalidKeys.push(key);
        }
      }
      if (invalidKeys.length) {
        return save
          ? {
              success: false,
              services: [],
              restarted: [],
              needsProcessRestart: [],
              changed: [],
              recovered: [],
              invalidKeys,
            }
          : { success: false, services: [], invalidKeys };
      }

      const overrides = Object.fromEntries(entries.map(({ key, value }) => [key, value]));
      const snapshots = new Map<ServiceName, Record<string, string>>();
      const previousSnapshots = new Map<ServiceName, Record<string, string> | undefined>();
      for (const consumer of consumers) {
        previousSnapshots.set(consumer, this.getServiceConfigSnapshot(consumer));
        const snapshot = this.getServiceConfigSnapshot(consumer, overrides);
        if (!snapshot) {
          const missing = this._remoteSchemas
            .get(consumer)!
            .groups.flatMap(candidate =>
              candidate.variables
                .filter(
                  item =>
                    item.required &&
                    !(
                      overrides[item.key] ??
                      this._rawValues.get(item.key as VariableName) ??
                      item.defaultValue
                    )
                )
                .map(item => item.key)
            );
          const result = {
            service: consumer,
            success: false,
            testMode: 'validation' as const,
            message: `Missing required values: ${missing.join(', ')}`,
          };
          return save
            ? {
                success: false,
                services: [result],
                restarted: [],
                needsProcessRestart: [],
                changed: [],
                recovered: [],
              }
            : { success: false, services: [result] };
        }
        snapshots.set(consumer, snapshot);
      }

      const serviceResults: TestConfigsResult['services'] = [];
      for (const consumer of consumers) {
        const instance = this._registeredServices.get(consumer);
        if (!instance?.testConfiguration || !instance.applyConfiguration) {
          serviceResults.push({
            service: consumer,
            success: false,
            testMode: 'live',
            message: `${consumer} is unavailable for configuration testing`,
          });
          continue;
        }
        try {
          const test = await instance.testConfiguration(
            Object.entries(snapshots.get(consumer)!).map(([key, value]) => ({ key, value }))
          );
          serviceResults.push({
            service: consumer,
            success: test.success,
            testMode: test.mode ?? 'live',
            message: test.message,
          });
        } catch (error) {
          serviceResults.push({
            service: consumer,
            success: false,
            testMode: 'live',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const success =
        serviceResults.length === consumers.length &&
        serviceResults.every(result => result.success);
      if (!success || !save) {
        return save
          ? {
              success,
              services: serviceResults,
              restarted: [],
              needsProcessRestart: [],
              changed: [],
              recovered: [],
            }
          : { success, services: serviceResults };
      }

      const changed = entries.filter(
        ({ key, value }) => this._rawValues.get(key as VariableName) !== value
      );
      if (!changed.length) {
        return {
          success: true,
          services: serviceResults,
          restarted: [],
          needsProcessRestart: [],
          changed: [],
          recovered: [],
        };
      }
      const rawSnapshot = new Map(this._rawValues);
      const computedSnapshot = { ...this._computedValues };
      const fileSnapshot = { ...this._fileData };
      for (const { key, value } of changed) {
        const variableName = key as VariableName;
        this._rawValues.set(variableName, value);
        (this._computedValues as Record<string, unknown>)[key] = applyTransform(
          key as never,
          this._variablesInfo.get(variableName) ?? group.variables[key],
          value
        );
        if (value) {
          const { isSecret } = this.findVariableInfo(variableName);
          this._fileData[variableName] = isSecret
            ? ENC_PREFIX + this._encryptionService!.encryptString(value)
            : value;
        } else delete this._fileData[variableName];
      }

      const attempted: ServiceName[] = [];
      let applying: ServiceName | undefined;
      try {
        await this.saveConfigFile();
        for (const consumer of consumers) {
          applying = consumer;
          // A lost response can happen after the remote service activated the
          // snapshot, so include the in-flight consumer in rollback attempts.
          attempted.push(consumer);
          const instance = this._registeredServices.get(consumer)!;
          const result = await instance.applyConfiguration!(
            Object.entries(snapshots.get(consumer)!).map(([key, value]) => ({ key, value }))
          );
          if (!result.success)
            throw new Error(result.message ?? `${consumer} rejected configuration`);
        }
      } catch (error) {
        this._rawValues = rawSnapshot;
        this._computedValues = computedSnapshot;
        this._fileData = fileSnapshot;
        await this.saveConfigFile();
        for (const consumer of attempted.reverse()) {
          const previous = previousSnapshots.get(consumer);
          try {
            const instance = this._registeredServices.get(consumer);
            const restored = previous
              ? await instance?.applyConfiguration?.(
                  Object.entries(previous).map(([key, value]) => ({ key, value }))
                )
              : await instance?.clearConfiguration?.();
            if (!restored?.success) {
              throw new Error(restored?.message ?? `${consumer} did not accept the rollback`);
            }
          } catch (rollbackError) {
            const message =
              rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
            logger.error('Config', `Failed to restore ${consumer} configuration`, rollbackError);
            const failedConsumer = serviceResults.find(result => result.service === consumer);
            if (failedConsumer) {
              failedConsumer.success = false;
              failedConsumer.message = `${failedConsumer.message}; rollback failed: ${message}`;
            }
          }
        }
        const failed = serviceResults.find(result => result.service === applying);
        if (failed) {
          failed.success = false;
          failed.message = error instanceof Error ? error.message : String(error);
        }
        return {
          success: false,
          services: serviceResults,
          restarted: [],
          needsProcessRestart: [],
          changed: [],
          recovered: [],
        };
      }

      this.notifyChanges();
      return {
        success: true,
        services: serviceResults,
        restarted: consumers,
        needsProcessRestart: [],
        changed: [groupName],
        recovered: [],
      };
    });
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
