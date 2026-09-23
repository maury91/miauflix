import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type ConfigMutation = {
  values?: Record<string, string>;
  unsetKeys?: string[];
};

export type ConfigStoreOptions = {
  filePath: string;
  lockTimeoutMs?: number;
  retryDelayMs?: number;
  staleLockMs?: number;
};

export type ServiceKeyOptions = {
  filePath: string;
  encryptionKey?: string;
};

/** Encrypts with a deployment key when provided, otherwise a persistent service key. */
export class ServiceSecretCodec {
  readonly key: string;
  private readonly keyBytes: Buffer;

  constructor(options: ServiceKeyOptions) {
    const configuredKey = options.encryptionKey;
    this.keyBytes = configuredKey
      ? createHash('sha256').update(configuredKey).digest()
      : Buffer.from(loadOrCreateServiceKey(options.filePath), 'base64');
    this.key = this.keyBytes.toString('base64');
    if (this.keyBytes.length !== 32) throw new Error('Service key must contain 32 bytes');
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keyBytes, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `enc:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')}`;
  }

  decrypt(value: string): string {
    if (!value.startsWith('enc:')) return value;
    const payload = Buffer.from(value.slice(4), 'base64');
    if (payload.length < 28) throw new Error('Invalid encrypted configuration value');
    const decipher = createDecipheriv('aes-256-gcm', this.keyBytes, payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString(
      'utf8'
    );
  }
}

function loadOrCreateServiceKey(filePath: string): string {
  mkdirSync(dirname(filePath), { recursive: true });
  if (existsSync(filePath)) {
    const key = readFileSync(filePath, 'utf8').trim();
    if (!/^[A-Za-z0-9+/]+=*$/.test(key) || Buffer.from(key, 'base64').length !== 32) {
      throw new Error(`Invalid service key at ${filePath}`);
    }
    chmodSync(filePath, 0o600);
    return key;
  }
  const key = randomBytes(32).toString('base64');
  let fd: number;
  try {
    fd = openSync(filePath, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      const key = readFileSync(filePath, 'utf8').trim();
      if (!/^[A-Za-z0-9+/]+=*$/.test(key) || Buffer.from(key, 'base64').length !== 32) {
        throw new Error(`Invalid service key at ${filePath}`);
      }
      chmodSync(filePath, 0o600);
      return key;
    }
    throw error;
  }
  try {
    writeFileSync(fd, `${key}\n`, 'utf8');
    chmodSync(filePath, 0o600);
  } finally {
    closeSync(fd);
  }
  return key;
}

const DEFAULT_LOCK_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_DELAY_MS = 50;
const DEFAULT_STALE_LOCK_MS = 30_000;

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A small cross-process JSON store. Callers are given an explicit ownership
 * set; values outside that set are preserved but never returned or changed.
 */
export class ConfigStore {
  private readonly lockPath: string;
  private readonly lockTimeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly staleLockMs: number;

  constructor(private readonly options: ConfigStoreOptions) {
    this.lockPath = `${options.filePath}.lock`;
    this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.staleLockMs = options.staleLockMs ?? DEFAULT_STALE_LOCK_MS;
  }

  async read(ownedKeys: ReadonlySet<string>): Promise<Record<string, string>> {
    const values = await this.readAll();
    return Object.fromEntries(Object.entries(values).filter(([key]) => ownedKeys.has(key)));
  }

  readSync(ownedKeys: ReadonlySet<string>): Record<string, string> {
    const values = this.readAllSync();
    return Object.fromEntries(Object.entries(values).filter(([key]) => ownedKeys.has(key)));
  }

  async update(
    ownedKeys: ReadonlySet<string>,
    mutation: ConfigMutation
  ): Promise<Record<string, string>> {
    const release = await this.acquireLock();
    try {
      const current = await this.readAll();
      const values = mutation.values ?? {};
      const unsetKeys = mutation.unsetKeys ?? [];
      const invalidKeys = [
        ...Object.keys(values).filter(key => !ownedKeys.has(key)),
        ...unsetKeys.filter(key => !ownedKeys.has(key)),
      ];
      if (invalidKeys.length > 0) {
        throw new Error(
          `Configuration keys are not owned by this store: ${invalidKeys.join(', ')}`
        );
      }

      for (const key of unsetKeys) delete current[key];
      for (const [key, value] of Object.entries(values)) {
        if (value.length > 0) current[key] = value;
      }

      await this.writeAll(current);
      return Object.fromEntries(Object.entries(current).filter(([key]) => ownedKeys.has(key)));
    } finally {
      await release();
    }
  }

  private async readAll(): Promise<Record<string, string>> {
    try {
      const parsed = JSON.parse(await readFile(this.options.filePath, 'utf8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('configuration file must contain a JSON object');
      }
      return Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => typeof value === 'string')
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  private readAllSync(): Record<string, string> {
    try {
      const parsed = JSON.parse(readFileSync(this.options.filePath, 'utf8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('configuration file must contain a JSON object');
      }
      return Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => typeof value === 'string')
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  private async writeAll(values: Record<string, string>): Promise<void> {
    await mkdir(dirname(this.options.filePath), { recursive: true });
    const tempPath = `${this.options.filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(values, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(tempPath, this.options.filePath);
  }

  private async acquireLock(): Promise<() => Promise<void>> {
    const startedAt = Date.now();
    const token = `${process.pid}:${Math.random().toString(36).slice(2)}`;
    await mkdir(dirname(this.lockPath), { recursive: true });

    while (true) {
      try {
        await mkdir(this.lockPath);
        await writeFile(join(this.lockPath, 'owner'), token, { encoding: 'utf8', mode: 0o600 });
        return async () => {
          try {
            const owner = await readFile(join(this.lockPath, 'owner'), 'utf8');
            if (owner === token) await rm(this.lockPath, { recursive: true, force: true });
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        try {
          const lockAge = Date.now() - (await stat(this.lockPath)).mtimeMs;
          if (lockAge > this.staleLockMs) {
            await rm(this.lockPath, { recursive: true, force: true });
            continue;
          }
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError;
        }
        if (Date.now() - startedAt >= this.lockTimeoutMs) {
          throw new Error(`Timed out waiting for configuration lock: ${this.lockPath}`);
        }
        await sleep(this.retryDelayMs);
      }
    }
  }
}
