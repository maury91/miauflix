import { logger } from '@logger';
import type { ServiceConfigSchema } from '@miauflix/contract';

import { ConfigurationServiceError } from '@errors/configuration.errors';
import type { ConfigurableService } from '@mytypes/configuration';
import {
  type ConfigurationGroup,
  replaceRemoteServiceGroups,
  services,
} from '@services/configuration/configuration.consts';
import { objectEntries } from '@utils/object.util';

import type { ConfigurationContext } from './configuration.context';
import { runLocalServiceAction } from './configuration.local-action';
import {
  buildServiceConfigSnapshot,
  isServiceVpnCheckKey,
  remoteVariableInfo,
} from './configuration.remote';
import { runRemoteGroupAction } from './configuration.remote-action';
import { serviceStatusMessage } from './configuration.runtime';
import { ConfigurationStore, transformWithFallback } from './configuration.store';
import { testAndSaveConfigs } from './configuration.test-and-save';
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
  assertKnownConfigKeys,
  buildAllConfigs,
  computeMissingVarsForGroup,
  isServiceName,
} from './configuration.utils';
import { runSetupWizard } from './configuration.wizard';

/**
 * Coordinates configuration: the variable registry (local services + schemas published by remote
 * services), reads, the registered service instances, and serialized writes. The work itself
 * lives in:
 * - configuration.store.ts — values, config.json load/persist, draft read views
 * - configuration.wizard.ts — the interactive CLI setup
 * - configuration.local-action.ts / configuration.remote-action.ts — test/save of one group
 * - configuration.test-and-save.ts — all-or-nothing test/save across groups
 */
export class ConfigurationService {
  private readonly _variablesInfo = new Map<VariableName, ExtendedVariableInfo>();
  private readonly _variableGroups = new Map<VariableName, string>();
  /** Variables whose values are owned and interpreted by this Backend process. */
  private readonly _localVariableNames = new Set<VariableName>();
  private readonly _managedVariableNames = new Set<VariableName>();
  /** Names currently published by each runtime-registered service. */
  private readonly _dynamicVariableNames = new Map<ServiceName, Set<VariableName>>();
  private readonly _remoteSchemas = new Map<ServiceName, ServiceConfigSchema>();
  /** Services that have self-registered with their live instance */
  private readonly _registeredServices = new Map<ServiceName, ConfigurableService>();
  /** Serializes temporary config overlays so concurrent requests cannot see each other's drafts. */
  private _configOperation: Promise<void> = Promise.resolve();
  private readonly _changeListeners = new Set<() => void>();
  private readonly store = new ConfigurationStore(this._variablesInfo, this._managedVariableNames);
  private readonly context: ConfigurationContext = {
    store: this.store,
    variablesInfo: this._variablesInfo,
    variableGroups: this._variableGroups,
    registeredServices: this._registeredServices,
    remoteConsumersForGroup: groupName => this.remoteConsumersForGroup(groupName),
    remoteSchema: serviceName => this._remoteSchemas.get(serviceName),
    getServiceConfigSnapshot: (serviceName, overrides) =>
      this.getServiceConfigSnapshot(serviceName, overrides),
    vpnCheckInheritors: rawValues => this.vpnCheckInheritors(rawValues),
    notifyChanges: () => this.notifyChanges(),
  };

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
   * Load env, defaults, generated secrets and config.json, then pre-compute all transforms
   * (see ConfigurationStore.init).
   *
   * Must be called once before any services are initialized.
   * After this, get() is a plain map lookup that cannot throw but can return empty values.
   */
  async init(): Promise<void> {
    this.autoConfigureDefaults();
    await this.store.init(this._localVariableNames);
  }

  /**
   * The only place that reads process.env for configured variables: snapshots it into the store
   * and auto-generates defaults for unset ones (see ConfigurationStore.autoConfigureDefaults).
   */
  private autoConfigureDefaults(
    variableNames?: Iterable<VariableName>,
    options?: { persistGeneratedDefaults?: boolean; useDefaults?: boolean }
  ): void {
    this.store.autoConfigureDefaults(process.env, variableNames, options);
  }

  /**
   * Registers runtime-declared variables (e.g. a remote service's published
   * schema) after init(). Remote values are deliberately not loaded: the remote
   * service owns and decrypts them. The schema is retained for wizard metadata
   * and request routing only.
   */
  registerRemoteConfiguration(serviceName: ServiceName, schema: ServiceConfigSchema): void {
    const { store } = this;
    const groups: Record<string, ConfigurationGroup> = {};
    for (const group of schema.groups) {
      groups[group.id] = {
        name: group.name,
        description: group.description,
        variables: Object.fromEntries(
          group.variables.map(item => [item.key, remoteVariableInfo(item)])
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
      this._variablesInfo.set(key, {
        ...remoteVariableInfo(item),
        serviceName,
      });
      this._variableGroups.set(key, group.id);
    }
    // Each service's VPN check (SOURCES_DISABLE_VPN_CHECK, MEDIA_LOAD_DISABLE_VPN_CHECK) follows
    // the deployment-wide DISABLE_VPN_CHECK until it is set itself. Only an env var or a saved value
    // counts as set: storing the inherited default would freeze it, and a later DISABLE_VPN_CHECK
    // change would no longer reach the service. Snapshots resolve the fallback when they are built.
    this.autoConfigureDefaults([...keys].filter(isServiceVpnCheckKey), {
      persistGeneratedDefaults: false,
      useDefaults: false,
    });
    this.autoConfigureDefaults(
      [...keys].filter(key => !isServiceVpnCheckKey(key)),
      { persistGeneratedDefaults: false }
    );
    const computed = store.computed as Record<string, unknown>;
    for (const key of keys) {
      const raw = store.raw.get(key);
      if (raw === undefined) continue;
      const outcome = transformWithFallback(key, this._variablesInfo.get(key)!, raw);
      if (outcome.kind === 'valid') {
        computed[key] = outcome.value;
      } else if (outcome.kind === 'default') {
        store.raw.set(key, outcome.defaultRaw);
        computed[key] = outcome.value;
        logger.warn('Config', `${key}: invalid remote value, reverted to default`);
      } else {
        // Keep an explicit empty raw value so a malformed schema default is
        // not reintroduced by getServiceConfigSnapshot().
        store.raw.set(key, '');
        delete computed[key];
        logger.warn('Config', `${key}: invalid remote value and no valid default`);
      }
    }
    const previous = this._dynamicVariableNames.get(serviceName) ?? new Set<VariableName>();
    for (const key of previous) {
      if (!keys.has(key) && !this.isPublishedByOtherService(key, serviceName)) {
        this._variablesInfo.delete(key);
        delete computed[key];
      }
    }
    this._dynamicVariableNames.set(serviceName, keys);
  }

  private isPublishedByOtherService(key: VariableName, serviceName: ServiceName): boolean {
    return [...this._remoteSchemas.entries()].some(
      ([owner, candidate]) =>
        owner !== serviceName &&
        candidate.groups.some(group => group.variables.some(item => item.key === key))
    );
  }

  getServiceConfigSnapshot(
    serviceName: ServiceName,
    overrides: Record<string, string> = {}
  ): Record<string, string> | undefined {
    const schema = this._remoteSchemas.get(serviceName);
    if (!schema) return undefined;
    return buildServiceConfigSnapshot(schema, this.store.readRaw(), overrides);
  }

  /**
   * Return the pre-computed value for a config variable.
   * Will not throw, instead it will return undefined
   */
  get<K extends keyof EnvironmentVariableTypes>(
    variable: K
  ): EnvironmentVariableTypes[K] | undefined {
    return this.store.readComputed()[variable];
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
    return (this.store.readComputed() as Record<string, unknown>)[variable];
  }

  /**
   * Save a config value to rawValues and persist to config.json.
   */
  async setValue<K extends keyof EnvironmentVariableTypes>(
    key: K,
    value: string
  ): Promise<boolean> {
    return this.withConfigLock(() => this.store.setValue(key, value));
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
    return runSetupWizard(
      {
        getRawValue: key => this.store.raw.get(key),
        variableGroups: this._variableGroups,
        registeredServices: this._registeredServices,
        isRemoteGroup: groupName => this.remoteConsumersForGroup(groupName).length > 0,
        saveServiceConfigs: (groupName, entries) => this.saveServiceConfigs(groupName, entries),
        setValue: (key, value) => this.setValue(key, value),
        waitForServicesReady: timeoutMs => this.waitForServicesReady(timeoutMs),
      },
      options
    );
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
      `${key} restart completed without becoming ready: ${serviceStatusMessage(this._registeredServices, key)}`
    );
    return null;
  }

  getServiceStatuses(): Record<string, ServiceStatusEntry> {
    const result: Record<string, ServiceStatusEntry> = {};
    for (const [key, instance] of this._registeredServices) {
      const status = instance.getStatus();
      switch (status.status) {
        case 'ready':
          result[key] = status.vpn ? { status: 'ready', vpn: status.vpn } : { status: 'ready' };
          break;
        case 'degraded': {
          const missingVars = status.missingVars;
          const resolvedMissingVars =
            missingVars && missingVars.length > 0
              ? missingVars
              : this.getMissingVarsForGroup(key as keyof typeof services);
          result[key] =
            resolvedMissingVars.length > 0
              ? { ...status, missingVars: resolvedMissingVars }
              : status;
          break;
        }
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
    const rawValues = this.store.readRaw();
    const remoteSchema = this._remoteSchemas.get(group);
    if (remoteSchema) {
      return remoteSchema.groups
        .flatMap(remoteGroup => remoteGroup.variables)
        .filter(
          item => item.required && !rawValues.get(item.key as VariableName) && !item.defaultValue
        )
        .map(item => item.key);
    }
    return computeMissingVarsForGroup(group, rawValues);
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

  /** Test one configuration group's draft without saving it. */
  async testServiceConfigs(
    serviceName: string,
    entries: { key: string; value: string }[]
  ): Promise<TestConfigsResult> {
    return this.runGroupAction(serviceName, entries, false) as Promise<TestConfigsResult>;
  }

  /** Test one configuration group's draft and, when every test passes, save and apply it. */
  async saveServiceConfigs(
    serviceName: string,
    entries: { key: string; value: string }[]
  ): Promise<SaveConfigsResult> {
    return this.runGroupAction(serviceName, entries, true) as Promise<SaveConfigsResult>;
  }

  /** Routes a single-group action to the remote-group or local-service flow. */
  private runGroupAction(
    groupName: string,
    entries: { key: string; value: string }[],
    save: boolean
  ): Promise<SaveConfigsResult | TestConfigsResult> {
    if (this.remoteConsumersForGroup(groupName).length) {
      return this.withConfigLock(() =>
        runRemoteGroupAction(this.context, groupName, entries, save)
      );
    }
    if (!isServiceName(groupName))
      throw new ConfigurationServiceError(
        `Configuration group '${groupName}' does not exist`,
        'service_not_found'
      );
    return this.withConfigLock(() =>
      runLocalServiceAction(this.context, entries, [groupName], save)
    );
  }

  /** Test entries spanning any number of groups and save them all, or none. */
  async testAndSaveConfigs(entries: { key: string; value: string }[]): Promise<SaveConfigsResult> {
    return this.withConfigLock(() => testAndSaveConfigs(this.context, entries));
  }

  /** Remote services whose own VPN opt-out is unset, so they follow DISABLE_VPN_CHECK. */
  private vpnCheckInheritors(
    rawValues: ReadonlyMap<VariableName, string>
  ): { serviceName: ServiceName; group: string }[] {
    return [...this._dynamicVariableNames.entries()].flatMap(([serviceName, keys]) =>
      [...keys]
        .filter(key => isServiceVpnCheckKey(key) && !rawValues.get(key))
        .flatMap(key => {
          const group = this._variableGroups.get(key);
          return group ? [{ serviceName, group }] : [];
        })
    );
  }

  private remoteConsumersForGroup(groupName: string): ServiceName[] {
    return [...this._remoteSchemas.entries()]
      .filter(([, schema]) => schema.groups.some(group => group.id === groupName))
      .map(([serviceName]) => serviceName);
  }

  /** Save values without testing them, then restart the affected services. */
  async updateConfigs(entries: { key: string; value: string }[]): Promise<UpdateConfigsResult> {
    return this.withConfigLock(async () => {
      assertKnownConfigKeys(entries);
      const { store } = this;

      // Save values and collect services whose keys actually changed
      const vpnDefaultBefore = store.raw.get('DISABLE_VPN_CHECK');
      const changedServices = new Set<ServiceName>();
      const invalidKeys: string[] = [];
      for (const { key, value } of entries) {
        try {
          const result = await store.setValue(key, value);
          if (result) {
            const info = this._variablesInfo.get(key);
            if (info) {
              changedServices.add(info.serviceName);
            }
          }
        } catch (error) {
          logger.warn(
            'Config',
            `${key}: invalid value — ${error instanceof Error ? error.message : error}`
          );
          invalidKeys.push(key);
        }
      }
      if (invalidKeys.length > 0) {
        return { success: false, invalidKeys };
      }
      if (vpnDefaultBefore !== store.raw.get('DISABLE_VPN_CHECK')) {
        for (const { serviceName } of this.vpnCheckInheritors(store.raw))
          changedServices.add(serviceName);
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
    });
  }

  async getAllConfigs(): Promise<ConfigEntryView[]> {
    const missingVars = new Set(
      Object.values(this.getServiceStatuses()).flatMap(status =>
        'missingVars' in status ? (status.missingVars ?? []) : []
      )
    );
    const { raw } = this.store;
    const vpnDefault = raw.get('DISABLE_VPN_CHECK') || 'false';
    return buildAllConfigs(raw).map(entry => {
      if (missingVars.has(entry.key)) return { ...entry, value: '', hasValue: false };
      // An unset service VPN check shows the DISABLE_VPN_CHECK value it follows.
      if (isServiceVpnCheckKey(entry.key) && !entry.hasValue)
        return { ...entry, value: vpnDefault, hasValue: true };
      return entry;
    });
  }
}
