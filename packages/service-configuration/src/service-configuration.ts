import { join } from 'node:path';

import {
  ConfigStore,
  type ConfigVariable,
  type ServiceConfigApplyResult,
  type ServiceConfigSchema,
  type ServiceConfigState,
  type ServiceConfigTestResult,
  type ServiceLifecycleState,
  ServiceSecretCodec,
} from '@miauflix/service-contracts';

export type ConfigurationProbeResult = { success: boolean; message: string };

export interface ConfigurationProbe {
  test(values: Record<string, string>): Promise<ConfigurationProbeResult>;
  activate?(values: Record<string, string>): Promise<ConfigurationProbeResult>;
}

export interface ServiceConfigurationOptions {
  schema: ServiceConfigSchema;
  prefix: string;
  dataDir: string;
  env?: Record<string, string | undefined>;
  configFilePath?: string;
  keyFilePath?: string;
  notWiredMessage?: string;
  onLoadError?: (message: string) => void;
}

/** Serializes configuration reads, probes, writes, and activations. */
export class OperationQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/**
 * Shared configuration mechanics for standalone services.
 *
 * Provider probing and lifecycle consumers remain service-owned through the
 * registered probe. The persisted format is intentionally prefix-scoped so
 * multiple services can safely share one JSON file.
 */
export class ServiceConfiguration {
  private readonly storageKeys: ReadonlySet<string>;
  private readonly fileValues: Record<string, string> = {};
  private readonly operations = new OperationQueue();
  private readonly store: ConfigStore;
  private readonly codec: ServiceSecretCodec;
  private readonly listeners = new Set<() => void>();
  private readonly env: Record<string, string | undefined>;
  private readonly notWiredMessage: string;
  private readonly onLoadError?: (message: string) => void;
  private prober: ConfigurationProbe | null = null;
  private loadError: string | null = null;
  private _state: ServiceLifecycleState = 'standby';
  private _errorMessage: string | null = null;

  constructor(private readonly options: ServiceConfigurationOptions) {
    this.env = options.env ?? process.env;
    this.notWiredMessage = options.notWiredMessage ?? 'Configuration provider is not wired yet';
    this.onLoadError = options.onLoadError;
    this.storageKeys = new Set(
      options.schema.variables.map(variable => `${options.prefix}__${variable.key}`)
    );
    const configFilePath =
      options.configFilePath ??
      this.env[`${options.prefix}_CONFIG_FILE`] ??
      join(options.dataDir, 'config.json');
    const keyFilePath =
      options.keyFilePath ??
      this.env[`${options.prefix}_KEY_FILE`] ??
      join(options.dataDir, '.service-key');
    this.store = new ConfigStore({ filePath: configFilePath });
    this.codec = new ServiceSecretCodec({ filePath: keyFilePath });
    this.loadFile();
  }

  getSchema(): ServiceConfigSchema {
    return this.options.schema;
  }

  getValues(): ServiceConfigState {
    return {
      configuredKeys: this.options.schema.variables
        .filter(variable => Boolean(this.resolve(variable.key)))
        .map(variable => variable.key),
    };
  }

  resolve(key: string): string {
    const variable = this.variable(key);
    return (
      [this.fileValues[key], this.env[key], variable?.defaultValue].find(
        value => value !== undefined && value.length > 0
      ) ?? ''
    );
  }

  resolvedValues(): Record<string, string> {
    return Object.fromEntries(
      this.options.schema.variables.map(variable => [variable.key, this.resolve(variable.key)])
    );
  }

  variable(key: string): ConfigVariable | undefined {
    return this.options.schema.variables.find(candidate => candidate.key === key);
  }

  missingVars(): string[] {
    return this.options.schema.variables
      .filter(variable => variable.required && !this.resolve(variable.key))
      .map(variable => variable.key);
  }

  get state(): ServiceLifecycleState {
    return this._state;
  }

  get errorMessage(): string | null {
    return this._errorMessage ?? (this._state === 'error' ? this.loadError : null);
  }

  registerProber(prober: ConfigurationProbe): void {
    this.prober = prober;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  validate(values: Record<string, string>): string[] {
    const invalidKeys: string[] = [];
    for (const [key, value] of Object.entries(values)) {
      const variable = this.variable(key);
      if (!variable) {
        invalidKeys.push(key);
        continue;
      }
      if (!value) continue;
      if (variable.inputType === 'select' && variable.options && !(value in variable.options)) {
        invalidKeys.push(key);
        continue;
      }
      if (variable.inputType === 'number') {
        const parsed = Number(value);
        const { min, max, integer } = variable.numberOptions ?? {};
        if (!Number.isFinite(parsed)) {
          invalidKeys.push(key);
          continue;
        }
        if (integer && !Number.isInteger(parsed)) invalidKeys.push(key);
        if (min !== undefined && parsed < min) invalidKeys.push(key);
        if (max !== undefined && parsed > max) invalidKeys.push(key);
        continue;
      }
      if (variable.inputType === 'text' && key.endsWith('_URL')) {
        try {
          new URL(value);
        } catch {
          invalidKeys.push(key);
        }
      }
    }
    return invalidKeys;
  }

  applyRemote(
    values: Record<string, string>,
    unsetKeys: string[] = []
  ): Promise<ServiceConfigApplyResult> {
    return this.operations.run(async () => {
      const invalidKeys = [
        ...this.validate(values),
        ...unsetKeys.filter(key => !this.variable(key)),
      ];
      if (invalidKeys.length > 0) return { success: false, reloaded: false, invalidKeys };

      try {
        const previous = this.resolvedValues();
        const previousStored = this.store.readSync(this.storageKeys);
        const candidate = this.candidateValues(values, unsetKeys);
        const test = await this.probe(candidate, { mutateState: false });
        if (!test.success) return { success: false, reloaded: false, test };

        await this.store.update(this.storageKeys, {
          values: Object.fromEntries(
            Object.entries(values)
              .filter(([, value]) => value.length > 0)
              .map(([key, value]) => [
                this.storageKey(key),
                this.isSecret(key) ? this.codec.encrypt(value) : value,
              ])
          ),
          unsetKeys: unsetKeys.map(key => this.storageKey(key)),
        });
        this.replaceValues(candidate);

        const activated = await this.probe(candidate, { mutateState: true, activate: true });
        if (!activated.success) {
          await this.store.update(this.storageKeys, {
            values: previousStored,
            unsetKeys: [...this.storageKeys],
          });
          this.replaceValues(previous);
          await this.probe(previous, { mutateState: true, activate: true });
          return { success: false, reloaded: false, test: activated };
        }
        return { success: true, reloaded: true, test: activated };
      } catch (error) {
        return {
          success: false,
          reloaded: false,
          test: {
            success: false,
            mode: 'live',
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    });
  }

  test(
    values: Record<string, string> = {},
    unsetKeys: string[] = []
  ): Promise<ServiceConfigTestResult> {
    return this.operations.run(async () => {
      const invalidKeys = [
        ...this.validate(values),
        ...unsetKeys.filter(key => !this.variable(key)),
      ];
      if (invalidKeys.length > 0) {
        return {
          success: false,
          mode: 'validation',
          message: `Invalid values for: ${invalidKeys.join(', ')}`,
          invalidKeys,
        };
      }
      return this.probe(this.candidateValues(values, unsetKeys), { mutateState: false });
    });
  }

  reload(): Promise<boolean> {
    return this.operations.run(async () => {
      this.loadFile();
      const result = await this.probe(this.resolvedValues());
      return result.success;
    });
  }

  private storageKey(key: string): string {
    return `${this.options.prefix}__${key}`;
  }

  private candidateValues(
    values: Record<string, string>,
    unsetKeys: string[]
  ): Record<string, string> {
    const candidate = this.resolvedValues();
    for (const key of unsetKeys) {
      const variable = this.variable(key);
      candidate[key] = this.env[key] ?? variable?.defaultValue ?? '';
    }
    for (const [key, value] of Object.entries(values)) {
      if (value.length > 0) candidate[key] = value;
    }
    return candidate;
  }

  private isSecret(key: string): boolean {
    const variable = this.variable(key);
    return variable?.secret === true || variable?.inputType === 'password';
  }

  private replaceValues(values: Record<string, string>): void {
    for (const key of Object.keys(this.fileValues)) delete this.fileValues[key];
    Object.assign(this.fileValues, values);
  }

  private transition(state: ServiceLifecycleState, errorMessage: string | null): void {
    if (this._state === state && this._errorMessage === errorMessage) return;
    this._state = state;
    this._errorMessage = errorMessage;
    for (const listener of this.listeners) listener();
  }

  private async probe(
    values: Record<string, string>,
    options: { mutateState?: boolean; activate?: boolean } = {}
  ): Promise<ServiceConfigTestResult> {
    const mutateState = options.mutateState ?? true;
    const missing = this.options.schema.variables
      .filter(variable => variable.required && !values[variable.key])
      .map(variable => variable.key);
    if (missing.length > 0) {
      if (mutateState) this.transition('standby', null);
      return {
        success: false,
        mode: 'validation',
        message: `Missing required configuration: ${missing.join(', ')}`,
      };
    }
    if (!this.prober) {
      if (mutateState) this.transition('configuring', null);
      return { success: false, mode: 'live', message: this.notWiredMessage };
    }
    if (mutateState) this.transition('configuring', null);
    try {
      const result =
        (options.activate ?? mutateState) && this.prober.activate
          ? await this.prober.activate(values)
          : await this.prober.test(values);
      if (mutateState)
        this.transition(result.success ? 'ready' : 'error', result.success ? null : result.message);
      return { success: result.success, mode: 'live', message: result.message };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (mutateState) this.transition('error', message);
      return { success: false, mode: 'live', message };
    }
  }

  private loadFile(): void {
    try {
      const stored = this.store.readSync(this.storageKeys);
      const values: Record<string, string> = {};
      for (const variable of this.options.schema.variables) {
        const storedValue = stored[this.storageKey(variable.key)];
        if (storedValue === undefined) continue;
        values[variable.key] = this.isSecret(variable.key)
          ? this.codec.decrypt(storedValue)
          : storedValue;
      }
      this.replaceValues(values);
      this.loadError = null;
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error);
      this.replaceValues({});
      this._state = 'error';
      this._errorMessage = this.loadError;
      this.onLoadError?.(this.loadError);
    }
  }
}
