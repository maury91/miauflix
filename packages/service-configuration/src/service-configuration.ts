import {
  type ServiceConfigApplyResult,
  type ServiceConfigSchema,
  type ServiceConfigTestResult,
  type ServiceLifecycleState,
} from '@miauflix/service-contracts';

export type ConfigurationProbeResult = { success: boolean; message: string };

export interface ConfigurationProbe {
  test(values: Record<string, string>): Promise<ConfigurationProbeResult>;
  activate?(values: Record<string, string>): Promise<ConfigurationProbeResult>;
  deactivate?(): Promise<ConfigurationProbeResult>;
}

export interface ServiceConfigurationOptions {
  schema: ServiceConfigSchema;
  notWiredMessage?: string;
}

/** Serializes probes and activation while keeping backend-owned values in memory. */
export class OperationQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/** Runtime view of configuration pushed by the backend. This class never reads or writes files. */
export class ServiceConfiguration {
  private readonly operations = new OperationQueue();
  private readonly listeners = new Set<() => void>();
  private readonly notWiredMessage: string;
  private prober: ConfigurationProbe | null = null;
  private activeValues: Record<string, string> = {};
  private _state: ServiceLifecycleState = 'standby';
  private _errorMessage: string | null = null;

  constructor(private readonly options: ServiceConfigurationOptions) {
    this.notWiredMessage = options.notWiredMessage ?? 'Configuration provider is not wired yet';
  }

  getSchema(): ServiceConfigSchema {
    return this.options.schema;
  }

  get values(): Record<string, string> {
    return { ...this.activeValues };
  }

  resolve(key: string): string {
    return this.activeValues[key] ?? '';
  }

  get ready(): boolean {
    return this.missingVars(this.activeValues).length === 0 && this._state === 'ready';
  }

  get state(): ServiceLifecycleState {
    return this._state;
  }

  get errorMessage(): string | null {
    return this._errorMessage;
  }

  registerProber(prober: ConfigurationProbe): void {
    this.prober = prober;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  missingVars(values: Record<string, string> = this.activeValues): string[] {
    return this.options.schema.groups.flatMap(group =>
      group.variables
        .filter(variable => variable.required && !values[variable.key])
        .map(variable => variable.key)
    );
  }

  validate(values: Record<string, string>): string[] {
    const invalidKeys: string[] = [];
    const variables = new Map(
      this.options.schema.groups.flatMap(group =>
        group.variables.map(variable => [variable.key, variable] as const)
      )
    );
    for (const [key, value] of Object.entries(values)) {
      const variable = variables.get(key);
      if (!variable) {
        invalidKeys.push(key);
        continue;
      }
      if (!value) continue;
      if (variable.inputType === 'select' && variable.options && !(value in variable.options)) {
        invalidKeys.push(key);
      } else if (variable.inputType === 'number') {
        const parsed = Number(value);
        const { min, max, integer } = variable.numberOptions ?? {};
        if (
          !Number.isFinite(parsed) ||
          (integer && !Number.isInteger(parsed)) ||
          (min !== undefined && parsed < min) ||
          (max !== undefined && parsed > max)
        )
          invalidKeys.push(key);
      } else if (variable.inputType === 'text' && key.endsWith('_URL')) {
        try {
          new URL(value);
        } catch {
          invalidKeys.push(key);
        }
      }
    }
    return invalidKeys;
  }

  applyRemote(values: Record<string, string>): Promise<ServiceConfigApplyResult> {
    return this.operations.run(async () => {
      const test = await this.probe(values, false);
      if (!test.success) return { success: false, activated: false, test };
      const previous = this.activeValues;
      const activated = await this.activate(values);
      if (!activated.success) {
        if (Object.keys(previous).length) await this.activate(previous);
        return {
          success: false,
          activated: false,
          test: { success: false, mode: 'live', message: activated.message },
        };
      }
      this.activeValues = { ...values };
      this.transition('ready', null);
      return {
        success: true,
        activated: true,
        test: { success: true, mode: 'live', message: activated.message },
      };
    });
  }

  clearRemote(): Promise<ServiceConfigApplyResult> {
    return this.operations.run(async () => {
      if (this.prober?.deactivate) {
        const result = await this.prober.deactivate();
        if (!result.success) {
          return {
            success: false,
            activated: false,
            test: { success: false, mode: 'live', message: result.message },
          };
        }
      }
      this.activeValues = {};
      this.transition('standby', null);
      return { success: true, activated: false };
    });
  }

  test(values: Record<string, string>): Promise<ServiceConfigTestResult> {
    return this.operations.run(() => this.probe(values, false));
  }

  reload(): Promise<boolean> {
    return this.operations.run(async () => {
      if (Object.keys(this.activeValues).length === 0) {
        this.transition('standby', null);
        return false;
      }
      const result = await this.activate(this.activeValues);
      this.transition(result.success ? 'ready' : 'error', result.success ? null : result.message);
      return result.success;
    });
  }

  private transition(state: ServiceLifecycleState, errorMessage: string | null): void {
    if (this._state === state && this._errorMessage === errorMessage) return;
    this._state = state;
    this._errorMessage = errorMessage;
    for (const listener of this.listeners) listener();
  }

  private async probe(
    values: Record<string, string>,
    mutateState: boolean
  ): Promise<ServiceConfigTestResult> {
    const invalidKeys = this.validate(values);
    if (invalidKeys.length) {
      return {
        success: false,
        mode: 'validation',
        message: `Invalid values for: ${invalidKeys.join(', ')}`,
        invalidKeys,
      };
    }
    const missing = this.missingVars(values);
    if (missing.length) {
      return {
        success: false,
        mode: 'validation',
        message: `Missing required configuration: ${missing.join(', ')}`,
        invalidKeys: missing,
      };
    }
    if (!this.prober) {
      if (mutateState) this.transition('configuring', null);
      return { success: false, mode: 'live', message: this.notWiredMessage };
    }
    try {
      const result = await this.prober.test(values);
      return { success: result.success, mode: 'live', message: result.message };
    } catch (error) {
      return {
        success: false,
        mode: 'live',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async activate(values: Record<string, string>): Promise<ConfigurationProbeResult> {
    if (!this.prober) return { success: false, message: this.notWiredMessage };
    try {
      return this.prober.activate
        ? await this.prober.activate(values)
        : await this.prober.test(values);
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}
