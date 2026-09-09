import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { logger } from '../logger';
import type {
  CatalogConfigSchema,
  CatalogConfigTestResult,
  CatalogConfigValues,
  CatalogConfigWriteResult,
  CatalogState,
  ConfigVariableSchema,
} from '../types';
import { CATALOG_CONFIG_SCHEMA } from './schema';

const SCOPE = 'CatalogConfig';

/** Live probe of the catalog provider with a candidate set of values. */
export interface ConfigProber {
  test(values: Record<string, string>): Promise<{ success: boolean; message: string }>;
}

/** Serializes async work so state transitions never interleave. */
export class OperationQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

interface StoredValues {
  values: Record<string, string>;
}

/**
 * Configuration of the service.
 *
 * Resolution precedence (highest first):
 *   1. values pushed by the main app (`applyRemote`) — the authoritative source,
 *      since the main app's config.json is the store the UI/CLI write to
 *   2. environment variables
 *   3. the service-local last-known-good file (`catalog.config.json`), so the
 *      service can also run standalone (e.g. provider debugging)
 *   4. schema defaults
 *
 * Empty or masked values never enter the chain — a push can therefore never wipe
 * a value coming from env/file/default.
 */
export class CatalogConfigService {
  private readonly schema: CatalogConfigSchema = CATALOG_CONFIG_SCHEMA;
  private readonly fileValues: Record<string, string> = {};
  private readonly pushedValues: Record<string, string> = {};
  private readonly operations = new OperationQueue();
  private prober: ConfigProber | null = null;

  private _state: CatalogState = 'standby';
  private _errorMessage: string | null = null;

  constructor(
    private readonly dataDir: string,
    private readonly env: Record<string, string | undefined> = process.env
  ) {
    this.loadFile();
  }

  getSchema(): CatalogConfigSchema {
    return this.schema;
  }

  getValues(): CatalogConfigValues {
    return {
      configuredKeys: this.schema.variables
        .filter(variable => Boolean(this.resolve(variable.key)))
        .map(variable => variable.key),
    };
  }

  /** Resolved (never masked) value of a single variable. */
  resolve(key: string): string {
    const variable = this.variable(key);
    return (
      this.pushedValues[key] ??
      this.env[key] ??
      this.fileValues[key] ??
      variable?.defaultValue ??
      ''
    );
  }

  resolvedValues(): Record<string, string> {
    return Object.fromEntries(
      this.schema.variables.map(variable => [variable.key, this.resolve(variable.key)])
    );
  }

  variable(key: string): ConfigVariableSchema | undefined {
    return this.schema.variables.find(candidate => candidate.key === key);
  }

  missingVars(): string[] {
    return this.schema.variables
      .filter(variable => variable.required && !this.resolve(variable.key))
      .map(variable => variable.key);
  }

  get state(): CatalogState {
    return this._state;
  }

  get errorMessage(): string | null {
    return this._errorMessage;
  }

  registerProber(prober: ConfigProber): void {
    this.prober = prober;
  }

  /**
   * Validates `values` against the schema without persisting anything.
   * Returns the list of offending keys (empty when valid).
   */
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

  /**
   * The main app's "green flag": merge the pushed values into the resolution chain,
   * persist the merged result as last-known-good, hot-reload the provider and probe.
   */
  applyRemote(
    values: Record<string, string>,
    unsetKeys: string[] = []
  ): Promise<CatalogConfigWriteResult> {
    return this.operations.run(async () => {
      const invalidKeys = [
        ...this.validate(values),
        ...unsetKeys.filter(key => !this.variable(key)),
      ];
      if (invalidKeys.length > 0) {
        return { success: false, reloaded: false, invalidKeys };
      }

      const applicable = this.applicableValues(values);
      for (const [key, value] of Object.entries(applicable)) {
        this.pushedValues[key] = value;
      }
      for (const key of unsetKeys) {
        delete this.pushedValues[key];
        delete this.fileValues[key];
      }

      this.persistFile();
      logger.info(
        SCOPE,
        `Configuration pushed (${Object.keys(applicable).length} value(s) applied)`
      );

      const test = await this.probe();
      return {
        success: test.success,
        reloaded: true,
        test,
      };
    });
  }

  /** Live probe without persisting anything — and without touching the live state. */
  test(values: Record<string, string> = {}): Promise<CatalogConfigTestResult> {
    return this.operations.run(async () => {
      const invalidKeys = this.validate(values);
      if (invalidKeys.length > 0) {
        return {
          success: false,
          mode: 'validation',
          message: `Invalid values for: ${invalidKeys.join(', ')}`,
          invalidKeys,
        };
      }
      return this.probe(this.mergedValues(values), { mutateState: false });
    });
  }

  /** Re-resolves configuration and re-probes the provider (hot reload). */
  reload(): Promise<boolean> {
    return this.operations.run(async () => {
      const result = await this.probe();
      return result.success;
    });
  }

  /**
   * Drops empty values. Clearing a persisted override is explicit through unsetKeys.
   */
  private applicableValues(values: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(values).filter(([, value]) => value.length > 0));
  }

  private mergedValues(overrides: Record<string, string>): Record<string, string> {
    const merged = this.resolvedValues();
    for (const [key, value] of Object.entries(this.applicableValues(overrides))) {
      merged[key] = value;
    }
    return merged;
  }

  private async probe(
    values: Record<string, string> = this.resolvedValues(),
    options: { mutateState?: boolean } = {}
  ): Promise<CatalogConfigTestResult> {
    const mutateState = options.mutateState ?? true;
    const missing = this.schema.variables
      .filter(variable => variable.required && !values[variable.key])
      .map(variable => variable.key);

    if (missing.length > 0) {
      if (mutateState) {
        this._state = 'standby';
        this._errorMessage = null;
      }
      return {
        success: false,
        mode: 'validation',
        message: `Missing required configuration: ${missing.join(', ')}`,
      };
    }

    if (!this.prober) {
      if (mutateState) this._state = 'configuring';
      return {
        success: false,
        mode: 'live',
        message: 'Catalog provider is not wired yet',
      };
    }

    if (mutateState) this._state = 'configuring';
    try {
      const result = await this.prober.test(values);
      if (mutateState) {
        this._state = result.success ? 'ready' : 'error';
        this._errorMessage = result.success ? null : result.message;
      }
      return {
        success: result.success,
        mode: 'live',
        message: result.message,
      };
    } catch (error) {
      if (mutateState) {
        this._state = 'error';
        this._errorMessage = error instanceof Error ? error.message : String(error);
      }
      return {
        success: false,
        mode: 'live',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private get filePath(): string {
    return join(this.dataDir, 'catalog.config.json');
  }

  private loadFile(): void {
    try {
      const stored = JSON.parse(readFileSync(this.filePath, 'utf8')) as StoredValues;
      Object.assign(this.fileValues, stored.values ?? {});
      logger.debug(SCOPE, `Loaded last-known-good configuration from ${this.filePath}`);
    } catch {
      logger.debug(SCOPE, 'No last-known-good configuration file present');
    }
  }

  /** Atomic write of the merged last-known-good values (standalone fallback). */
  private persistFile(): void {
    try {
      mkdirSync(this.dataDir, { recursive: true });
      const payload: StoredValues = {
        values: { ...this.fileValues, ...this.applicableValues(this.pushedValues) },
      };
      const tmpPath = `${this.filePath}.tmp`;
      writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
      renameSync(tmpPath, this.filePath);
    } catch (error) {
      logger.warn(SCOPE, 'Could not persist last-known-good configuration', error);
    }
  }
}
