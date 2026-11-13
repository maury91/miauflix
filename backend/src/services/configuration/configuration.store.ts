import { AsyncLocalStorage } from 'node:async_hooks';

import { logger } from '@logger';
import { ConfigStore } from '@miauflix/service-configuration';
import { mkdirSync } from 'fs';
import path from 'path';

import { ConfigurationServiceError } from '@errors/configuration.errors';
import type { VariableInfo } from '@mytypes/configuration';
import { EncryptionService } from '@services/encryption/encryption.service';

import type {
  EnvironmentVariableTypes,
  ExtendedVariableInfo,
  VariableName,
} from './configuration.types';
import { applyTransform, getDefaultValue, resolveVariableInfo } from './configuration.utils';

const ENC_PREFIX = 'enc:';

type ReadView = {
  active: boolean;
  rawValues: ReadonlyMap<VariableName, string>;
  computedValues: Readonly<Partial<EnvironmentVariableTypes>>;
};

/** Copy of the mutable store state, used to roll back a failed save. */
export type ConfigurationStoreSnapshot = {
  raw: Map<VariableName, string>;
  computed: Partial<EnvironmentVariableTypes>;
  fileData: Partial<Record<VariableName, string>>;
};

/** Result of transforming a raw value, falling back to the variable's default when invalid. */
export type TransformOutcome =
  | { kind: 'default'; value: unknown; defaultRaw: string }
  | { kind: 'empty' }
  | { kind: 'valid'; value: unknown };

/**
 * Transform `raw`; when it is invalid, transform the variable's default instead; when that is
 * invalid too, report an empty value.
 */
export function transformWithFallback(
  key: VariableName,
  info: VariableInfo,
  raw: string
): TransformOutcome {
  try {
    return { kind: 'valid', value: applyTransform(key, info, raw) };
  } catch {
    const defaultRaw =
      'defaultValue' in info && info.defaultValue ? getDefaultValue(info.defaultValue) : '';
    try {
      return { kind: 'default', value: applyTransform(key, info, defaultRaw), defaultRaw };
    } catch {
      return { kind: 'empty' };
    }
  }
}

/*
  Variable source precedence, from higher to lower
  - JSON file
  - ENV variable
  - Default value

  Generated secrets (function `defaultValue` + `skipUserInteraction`) are the
  exception: an explicit ENV variable wins over the JSON file, and a generated
  value is written to the JSON file on first boot so it survives restarts.
 */

/**
 * Holds configuration values and their on-disk representation (config.json):
 * loading at boot, encryption of secrets, persistence, snapshots for rollback, and the
 * temporary read view used while a draft configuration is being tested.
 */
export class ConfigurationStore {
  /** Raw string values: env snapshot + auto-generated + file-loaded + runtime set */
  raw = new Map<VariableName, string>();
  /** Post-transform computed values — what ConfigurationService.get() returns. */
  computed: Partial<EnvironmentVariableTypes> = {};
  /** On-disk representation of config.json (secrets have enc: prefix) */
  private fileData: Partial<Record<VariableName, string>> = {};
  private filePath: string | null = null;
  private configStore: ConfigStore | null = null;
  private encryptionService: EncryptionService | null = null;
  /** Secrets generated during this boot that are not yet persisted to config.json */
  private readonly unsavedGeneratedSecrets = new Set<VariableName>();
  /** Generated secrets that the environment provided when autoConfigureDefaults() ran */
  private readonly environmentGeneratedSecrets = new Set<VariableName>();
  private readonly readView = new AsyncLocalStorage<ReadView>();

  constructor(
    private readonly variablesInfo: ReadonlyMap<VariableName, ExtendedVariableInfo>,
    /** Keys this process owns in config.json; any other key in the file is left untouched. */
    private readonly managedVariableNames: ReadonlySet<VariableName>
  ) {}

  /**
   * Bootstrap (ConfigurationService.autoConfigureDefaults() must have filled raw from the
   * environment and defaults first):
   * 2. Create data directory, adopt generated secrets already persisted in config.json
   * 3. Create EncryptionService from the (persisted) SOURCE_SECURITY_KEY
   * 4. Load config.json — file values overwrite raw
   * 5. Persist secrets generated for the first time to config.json
   * 6. Pre-compute all transforms of `localVariableNames`
   */
  async init(localVariableNames: Iterable<VariableName>): Promise<void> {
    // Use raw values directly for bootstrap — these vars have no transforms
    const dataDir = this.raw.get('DATA_DIR');
    if (!dataDir) {
      // This should be impossible, this variable has a default value
      throw new ConfigurationServiceError(
        'DATA_DIR is missing, cannot continue',
        'missing_required_variable',
        'DATA_DIR'
      );
    }
    mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, 'config.json');
    this.configStore = new ConfigStore({ filePath: this.filePath });

    // Secrets generated on a previous boot replace the ones generated in memory just now.
    // This must happen before the EncryptionService is built, as it needs the persisted key.
    const storedValues = this.configStore.readAllSync();
    for (const varName of [...this.unsavedGeneratedSecrets]) {
      const stored = storedValues[varName];
      if (!stored) continue;
      this.unsavedGeneratedSecrets.delete(varName);
      if (!stored.startsWith(ENC_PREFIX)) this.raw.set(varName, stored);
    }

    const securityKey = this.raw.get('SOURCE_SECURITY_KEY');
    if (!securityKey) {
      // This should be impossible, this variable has a default value
      throw new ConfigurationServiceError(
        'SOURCE_SECURITY_KEY is missing, cannot continue',
        'missing_required_variable',
        'SOURCE_SECURITY_KEY'
      );
    }
    this.encryptionService = new EncryptionService(securityKey);

    this.loadFile();
    await this.persistGeneratedSecrets();
    this.precompute(localVariableNames);
  }

  /**
   * Snapshot `environment` for the given variables and auto-generate defaults for unset ones.
   * With `persistGeneratedDefaults`, generated secrets are queued for init() to save; with
   * `useDefaults: false`, only environment values are taken.
   * The store never reads process.env itself: ConfigurationService passes it in.
   */
  autoConfigureDefaults(
    environment: Readonly<Record<string, string | undefined>>,
    variableNames: Iterable<VariableName> = this.variablesInfo.keys(),
    { persistGeneratedDefaults = true, useDefaults = true } = {}
  ): void {
    for (const varName of variableNames) {
      const varInfo = this.variablesInfo.get(varName);
      if (!varInfo || this.raw.has(varName)) continue;

      // Coming from the environment, maximum precedence in this stage
      const fromEnvironment = environment[varName];
      if (fromEnvironment) {
        this.raw.set(varName, fromEnvironment);
        if (this.isGeneratedSecret(varName)) this.environmentGeneratedSecrets.add(varName);
        // then we fallback to the defaultValue ( if exists )
      } else if (useDefaults && 'defaultValue' in varInfo && varInfo.defaultValue) {
        this.raw.set(varName, getDefaultValue(varInfo.defaultValue));
        // Generated secrets (random passwords, keys, salts) must be persisted to avoid
        // them changing at every run; init() saves them to config.json
        if (persistGeneratedDefaults && this.isGeneratedSecret(varName)) {
          this.unsavedGeneratedSecrets.add(varName);
        }
      }
    }
  }

  /**
   * Pre-compute all transforms after raw values are fully loaded.
   * If the stored value fails validation, falls back to:
   *   A. transform of the default value (if one exists and is valid)
   *   B. empty value
   */
  private precompute(variableNames: Iterable<VariableName>): void {
    const cv = this.computed as Record<keyof EnvironmentVariableTypes, unknown>;
    for (const varName of variableNames) {
      const varInfo = this.variablesInfo.get(varName);
      if (!varInfo) continue;
      const outcome = transformWithFallback(varName, varInfo, this.raw.get(varName) ?? '');
      if (outcome.kind === 'empty') {
        delete cv[varName];
        console.warn(
          `[Config] ${varName}: stored value is invalid and has no valid default, set to empty`
        );
        continue;
      }
      cv[varName] = outcome.value;
      if (outcome.kind === 'default')
        console.warn(`[Config] ${varName}: stored value is invalid, reverted to default`);
    }
  }

  private isGeneratedSecret(varName: VariableName): boolean {
    const varInfo = this.variablesInfo.get(varName);
    return (
      !!varInfo &&
      'skipUserInteraction' in varInfo &&
      !!varInfo.skipUserInteraction &&
      'defaultValue' in varInfo &&
      typeof varInfo.defaultValue === 'function'
    );
  }

  /**
   * Writes secrets generated during this boot to config.json in plain text: SOURCE_SECURITY_KEY
   * is needed to build the EncryptionService, so it cannot be stored encrypted with itself.
   */
  private async persistGeneratedSecrets(): Promise<void> {
    if (!this.configStore || this.unsavedGeneratedSecrets.size === 0) return;
    for (const varName of this.unsavedGeneratedSecrets) {
      const value = this.raw.get(varName);
      if (value) this.fileData[varName] = value;
    }
    await this.save();
    logger.info(
      'Config',
      `Generated and saved ${[...this.unsavedGeneratedSecrets].join(', ')} to ${this.filePath}`
    );
    this.unsavedGeneratedSecrets.clear();
  }

  private loadFile(): void {
    if (!this.configStore || !this.encryptionService) return;
    this.fileData = {};
    const fileData = this.configStore.readAllSync();
    for (const [key, raw] of Object.entries(fileData)) {
      this.fileData[key as VariableName] = raw;
      // An explicit environment variable wins over a previously generated secret
      if (this.environmentGeneratedSecrets.has(key as VariableName)) continue;
      let value = raw;
      if (raw.startsWith(ENC_PREFIX)) {
        try {
          value = this.encryptionService.decryptString(raw.slice(ENC_PREFIX.length), true, false);
        } catch {
          logger.warn(
            'Config',
            `${key}: saved encrypted value cannot be decrypted; ignoring it and keeping the current value`
          );
          continue;
        }
      }
      this.raw.set(key as VariableName, value);
    }
  }

  /** Writes the managed keys of the in-memory file data to config.json. */
  async save(): Promise<void> {
    if (!this.configStore) return;
    const values = Object.fromEntries(
      [...this.managedVariableNames]
        .map(key => [key, this.fileData[key]])
        .filter(
          (entry): entry is [VariableName, string] =>
            typeof entry[1] === 'string' && entry[1].length > 0
        )
    );
    const unsetKeys = [...this.managedVariableNames].filter(key => !(key in values));
    const stored = await this.configStore.update(this.managedVariableNames, {
      values,
      unsetKeys,
    });
    for (const key of unsetKeys) delete this.fileData[key];
    for (const [key, value] of Object.entries(stored)) this.fileData[key as VariableName] = value;
  }

  /** True once init() has opened config.json and the encryption key. */
  get isPersistent(): boolean {
    return !!this.filePath && !!this.encryptionService;
  }

  /** Stages `value` for config.json, encrypting it when the variable is a secret. Not saved yet. */
  setFileValue(key: VariableName, value: string): void {
    const { isSecret } = resolveVariableInfo(key, this.variablesInfo);
    this.fileData[key] = isSecret
      ? ENC_PREFIX + this.encryptionService!.encryptString(value)
      : value;
  }

  /** Stages the removal of `key` from config.json. Not saved yet. */
  removeFileValue(key: VariableName): void {
    delete this.fileData[key];
  }

  /**
   * Set one value and persist it. Returns false when the value (raw or transformed) is unchanged.
   * Throws when the value is rejected by the variable's transform.
   */
  async setValue<K extends keyof EnvironmentVariableTypes>(
    key: K,
    value: string
  ): Promise<boolean> {
    const previousValue = this.raw.get(key);
    if (previousValue === value) {
      return false;
    }

    const varInfo = this.variablesInfo.get(key);
    const transformedValue = varInfo
      ? applyTransform(key, varInfo, value)
      : (value as EnvironmentVariableTypes[K]);

    if (this.computed[key] === transformedValue) {
      return false;
    }

    this.raw.set(key, value);
    this.computed[key] = transformedValue;
    if (this.isPersistent) {
      this.setFileValue(key, value);
      await this.save();
    }
    return true;
  }

  snapshot(): ConfigurationStoreSnapshot {
    return {
      raw: new Map(this.raw),
      computed: { ...this.computed },
      fileData: { ...this.fileData },
    };
  }

  restore(snapshot: ConfigurationStoreSnapshot): void {
    this.raw = snapshot.raw;
    this.computed = snapshot.computed;
    this.fileData = snapshot.fileData;
  }

  /** Raw values as seen by the current async context (a draft while one is being tested). */
  readRaw(): ReadonlyMap<VariableName, string> {
    const view = this.readView.getStore();
    return view?.active ? view.rawValues : this.raw;
  }

  /** Computed values as seen by the current async context (a draft while one is being tested). */
  readComputed(): Readonly<Partial<EnvironmentVariableTypes>> {
    const view = this.readView.getStore();
    return view?.active ? view.computedValues : this.computed;
  }

  /** Runs `operation` so that reads made from its async context see the given draft values. */
  withReadView<T>(
    rawValues: ReadonlyMap<VariableName, string>,
    computedValues: Readonly<Partial<EnvironmentVariableTypes>>,
    operation: () => Promise<T>
  ): Promise<T> {
    const view: ReadView = { active: true, rawValues, computedValues };
    return this.readView.run(view, async () => {
      try {
        return await operation();
      } finally {
        view.active = false;
      }
    });
  }
}
