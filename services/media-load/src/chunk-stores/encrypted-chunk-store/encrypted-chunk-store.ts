/*! fs-chunk-store with MANDATORY AES-256-CTR encryption. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
/*! This version requires an encryption key and always encrypts data using AES-256-CTR mode for random access. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import getFileRegex from 'filename-reserved-regex';
import fs from 'fs';
import { mkdir, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import RAF from 'random-access-file';

import type AbstractChunkStore from '../abstract-chunk-store/abstract-chunk-store';

// Type definitions
interface FileDescriptor {
  /** Path of the encrypted file on disk. */
  path: string;
  /** The file's path inside the stored content, as the caller named it. */
  logicalPath: string;
  length: number;
  offset: number;
  isOpen: () => boolean;
  open: () => Promise<RAF>;
  /** Close the handle if open; the next `open()` creates it again. */
  release: () => Promise<void>;
  /** Run an I/O operation on the handle; waits out a removal in progress and counts as in flight. */
  use: <T>(operation: (handle: RAF) => Promise<T>) => Promise<T>;
  /**
   * Remove the file: stop new operations, wait for in-flight ones, close, run `unlink`, and drop
   * any handle opened meanwhile so none outlives the unlinked file. Operations that arrived
   * during the removal then reopen a fresh file.
   */
  remove: (unlink: () => Promise<void>) => Promise<void>;
}

interface StorageFile {
  path: string;
  length: number;
  offset?: number;
}

export interface EncryptedStorageOptions {
  name?: string;
  addUID?: boolean;
  path?: string;
  files?: StorageFile[];
  length?: number;
  encryptionKey: Buffer | string;
  filenameSalt?: string; // Salt used for deterministic filename generation
}

interface ChunkTarget {
  from: number;
  to: number;
  offset: number;
  file: FileDescriptor;
}

interface GetOptions {
  offset?: number;
  length?: number;
}

type Callback<T = void> = (err: Error | null, value?: T) => void;

const RESERVED_FILENAME_REGEX = getFileRegex();

/**
 * Generates a deterministic "randomized" filename based on the original filename and encryption key
 * This ensures that the same inputs always produce the same output, but the output appears random
 */
function generateDeterministicFilename(
  originalFilename: string,
  encryptionKey: Buffer,
  salt: string
): string {
  return createHash('sha256')
    .update(originalFilename, 'utf8')
    .update(encryptionKey)
    .update(salt, 'utf8')
    .digest('hex')
    .substring(0, 24);
}

let TMP: string;
try {
  TMP = fs.statSync('/tmp') && '/tmp';
} catch {
  TMP = os.tmpdir();
}

export default class EncryptedChunkStore implements AbstractChunkStore {
  public readonly chunkLength: number;
  public readonly name: string;
  public readonly addUID?: boolean;
  public readonly path?: string;
  public readonly files: FileDescriptor[];
  public readonly length: number;
  public readonly chunkMap: ChunkTarget[][];
  public closed: boolean;
  public readonly lastChunkLength?: number;
  public readonly lastChunkIndex?: number;
  private readonly encryptionKey: Buffer;

  constructor(chunkLength: number, opts: EncryptedStorageOptions) {
    this.chunkLength = Number(chunkLength);
    if (!this.chunkLength) throw new Error('First argument must be a chunk length');

    // Encryption is mandatory in this implementation
    if (!opts || !opts.encryptionKey) {
      throw new Error('Encryption key is required for encrypted chunk store');
    }

    if (typeof opts.encryptionKey === 'string') {
      // Create a deterministic key from the provided string
      this.encryptionKey = createHash('sha256').update(opts.encryptionKey).digest();
    } else if (Buffer.isBuffer(opts.encryptionKey)) {
      if (opts.encryptionKey.length !== 32) {
        throw new Error('Encryption key buffer must be exactly 32 bytes for AES-256');
      }
      this.encryptionKey = opts.encryptionKey;
    } else {
      throw new Error('Encryption key must be a string or Buffer');
    }

    const filenameSalt = opts.filenameSalt || 'encrypted-chunk-store-filename-salt';
    this.name = opts.name || path.join('fs-chunk-store', randomBytes(20).toString('hex'));
    this.addUID = opts.addUID;

    const openableFile = (
      file: Omit<FileDescriptor, 'isOpen' | 'open' | 'release' | 'remove' | 'use'>
    ): FileDescriptor => {
      let handle: Promise<RAF> | null = null;
      let inFlight = 0;
      let drainWaiters: Array<() => void> = [];
      let removal: Promise<void> | null = null;
      const open = () => {
        handle ??= (async () => {
          if (this.closed) throw new Error('Storage is closed');

          await mkdir(path.dirname(file.path), { recursive: true });
          if (this.closed) throw new Error('Storage is closed');
          return new RAF(file.path);
        })();
        // A failed open is not cached, so the next call retries.
        const current = handle;
        current.catch(() => {
          if (handle === current) handle = null;
        });
        return current;
      };
      const release = async () => {
        const current = handle;
        handle = null;
        if (!current) return;
        const opened = await current.catch(() => null);
        if (!opened) return;
        await new Promise<void>((resolve, reject) => {
          opened.close(err => (err ? reject(err) : resolve()));
        });
      };
      const use = async <T>(operation: (raf: RAF) => Promise<T>): Promise<T> => {
        // Checked and counted without yielding in between, so a removal never misses an operation.
        while (removal) await removal.catch(() => undefined);
        inFlight++;
        try {
          return await operation(await open());
        } finally {
          if (--inFlight === 0) {
            const waiters = drainWaiters;
            drainWaiters = [];
            for (const wake of waiters) wake();
          }
        }
      };
      const remove = (unlink: () => Promise<void>): Promise<void> => {
        const previous = removal;
        const run = (async () => {
          await previous?.catch(() => undefined);
          while (inFlight > 0) await new Promise<void>(resolve => drainWaiters.push(resolve));
          try {
            await release();
            await unlink();
          } finally {
            await release();
          }
        })();
        removal = run;
        const clear = () => {
          if (removal === run) removal = null;
        };
        run.then(clear, clear);
        return run;
      };
      return {
        ...file,
        open,
        isOpen: () => handle !== null,
        release,
        use,
        remove,
      };
    };

    if (opts.files) {
      this.path = opts.path;
      this.files = opts.files.map(
        (file: StorageFile, i: number, files: StorageFile[]): FileDescriptor => {
          if (file.offset == null) {
            if (i === 0) {
              file.offset = 0;
            } else {
              const prevFile = files[i - 1];
              file.offset = (prevFile.offset || 0) + prevFile.length;
            }
          }

          const filename = generateDeterministicFilename(
            path.basename(file.path!),
            this.encryptionKey,
            filenameSalt
          );
          let newPath = '';

          if (this.path) {
            newPath = this.addUID
              ? path.resolve(path.join(this.path, this.name, newPath))
              : path.resolve(path.join(this.path, newPath));
          }
          newPath = path.join(newPath, filename.replace(RESERVED_FILENAME_REGEX, ''));
          return openableFile({
            path: newPath,
            logicalPath: file.path,
            length: file.length,
            offset: file.offset,
          });
        }
      );
      this.length = this.files.reduce((sum, file) => {
        return sum + file.length;
      }, 0);
      if (opts.length != null && opts.length !== this.length) {
        throw new Error('total `files` length is not equal to explicit `length` option');
      }
    } else {
      const len = Number(opts.length) || Infinity;
      this.files = [
        openableFile({
          offset: 0,
          path: path.resolve(opts.path || path.join(TMP, this.name)),
          logicalPath: '',
          length: len,
        }),
      ];
      this.length = len;
    }

    this.chunkMap = [];
    this.closed = false;

    // If the length is Infinity (i.e. a length was not specified) then the store will
    // automatically grow.
    if (this.length !== Infinity) {
      this.lastChunkLength = this.length % this.chunkLength || this.chunkLength;
      this.lastChunkIndex = Math.ceil(this.length / this.chunkLength) - 1;

      this.files.forEach(file => {
        const fileStart = file.offset;
        const fileEnd = file.offset + file.length;

        const firstChunk = Math.floor(fileStart / this.chunkLength);
        const lastChunk = Math.floor((fileEnd - 1) / this.chunkLength);

        for (let p = firstChunk; p <= lastChunk; ++p) {
          const chunkStart = p * this.chunkLength;
          const chunkEnd = chunkStart + this.chunkLength;

          const from = fileStart < chunkStart ? 0 : fileStart - chunkStart;
          const to = fileEnd > chunkEnd ? this.chunkLength : fileEnd - chunkStart;
          const offset = fileStart > chunkStart ? 0 : chunkStart - fileStart;

          if (!this.chunkMap[p]) this.chunkMap[p] = [];

          this.chunkMap[p].push({
            from,
            to,
            offset,
            file,
          });
        }
      });
    }
  }

  /**
   * Encrypts a buffer for a specific chunk index using CTR mode for random access
   */
  private encryptBuffer(buffer: Buffer, chunkIndex: number): Buffer {
    try {
      // Generate a deterministic IV/nonce based on chunk index for CTR mode
      // This ensures we can decrypt any chunk independently
      const iv = Buffer.alloc(16);
      iv.writeUInt32BE(chunkIndex, 12); // Put chunk index in last 4 bytes

      const cipher = createCipheriv('aes-256-ctr', this.encryptionKey, iv);
      return Buffer.concat([cipher.update(buffer), cipher.final()]);
    } catch (error) {
      throw new Error(
        `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Decrypts a buffer for a specific chunk index using CTR mode for random access
   */
  private decryptBuffer(buffer: Buffer, chunkIndex: number): Buffer {
    try {
      // Generate the same deterministic IV/nonce based on chunk index
      const iv = Buffer.alloc(16);
      iv.writeUInt32BE(chunkIndex, 12); // Put chunk index in last 4 bytes

      const decipher = createDecipheriv('aes-256-ctr', this.encryptionKey, iv);
      return Buffer.concat([decipher.update(buffer), decipher.final()]);
    } catch (error) {
      throw new Error(
        `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async _put(index: number, buf: Buffer) {
    if (this.closed) throw new Error('Storage is closed');

    const isLastChunk = index === this.lastChunkIndex;
    if (isLastChunk && buf.length !== this.lastChunkLength) {
      throw new Error('Last chunk length must be ' + this.lastChunkLength);
    }
    if (!isLastChunk && buf.length !== this.chunkLength) {
      throw new Error('Chunk length must be ' + this.chunkLength);
    }

    // Encrypt the buffer before storing
    const encryptedBuf = this.encryptBuffer(buf, index);

    if (this.length === Infinity) {
      return this.files[0].use(
        file =>
          new Promise<void>((resolve, reject) => {
            file.write(index * this.chunkLength, encryptedBuf, err => {
              if (err) return reject(err);
              resolve();
            });
          })
      );
    } else {
      const targets = this.chunkMap[index];
      if (!targets) throw new Error('no files matching the request range');
      const tasks = targets.map((target: ChunkTarget) =>
        target.file.use(
          file =>
            new Promise<void>((resolve, reject) => {
              // For multiple files, we need to handle encryption differently
              // We encrypt the entire chunk first, then split it
              const encryptedSubArray = encryptedBuf.subarray(target.from, target.to);
              file.write(target.offset, encryptedSubArray, err => {
                if (err) return reject(err);
                resolve();
              });
            })
        )
      );
      await Promise.all(tasks);
    }
  }

  public put(index: number, buf: Buffer, cb?: Callback): void {
    this._put(index, buf)
      .then(() => cb?.(null))
      .catch(err => cb?.(err));
  }

  private async _get(index: number, opts?: GetOptions | null): Promise<Buffer> {
    if (this.closed) throw new Error('Storage is closed');

    const chunkLength = index === this.lastChunkIndex ? this.lastChunkLength! : this.chunkLength;

    const rangeFrom = (opts && opts.offset) || 0;
    const rangeTo = opts && opts.length ? rangeFrom + opts.length : chunkLength;

    if (rangeFrom < 0 || rangeFrom < 0 || rangeTo > chunkLength) {
      throw new Error('Invalid offset and/or length');
    }

    if (this.length === Infinity) {
      if (rangeFrom === rangeTo) return Buffer.alloc(0);

      // For encrypted single file storage, we need to read the entire chunk and decrypt it
      const chunkOffset = index * this.chunkLength;
      const fullChunkBuffer = await this.files[0].use(
        file =>
          new Promise<Buffer>((resolve, reject) => {
            file.read(chunkOffset, chunkLength, (err: Error | null, buffer?: Buffer) => {
              if (err) return reject(err);
              resolve(buffer!);
            });
          })
      );

      return this.decryptBuffer(fullChunkBuffer, index).subarray(rangeFrom, rangeTo);
    }
    let targets = this.chunkMap[index];
    if (!targets) throw new Error('no files matching the request range');
    if (opts) {
      targets = targets.filter((target: ChunkTarget) => {
        return target.to > rangeFrom && target.from < rangeTo;
      });
      if (targets.length === 0) {
        throw new Error('no files matching the requested range');
      }
    }
    if (rangeFrom === rangeTo) return Buffer.alloc(0);

    const tasks = targets.map((target: ChunkTarget) =>
      target.file.use(
        file =>
          new Promise<Buffer>((resolve, reject) => {
            const to = Math.min(rangeTo, target.to);
            file.read(target.offset, to - target.from, (err: Error | null, buffer?: Buffer) => {
              if (err) return reject(err);
              resolve(buffer!);
            });
          })
      )
    );

    const offsetBuffer = Buffer.alloc(targets[0].from);
    const buffers = await Promise.all(tasks);
    const encryptedChunk = Buffer.concat([offsetBuffer, ...buffers]);

    return this.decryptBuffer(encryptedChunk, index).subarray(rangeFrom, rangeTo);
  }

  public get(index: number, cb?: Callback<Buffer>): void;
  public get(index: number, opts?: GetOptions | null, cb?: Callback<Buffer>): void;
  public get(
    index: number,
    opts?: Callback<Buffer> | GetOptions | null,
    cb?: Callback<Buffer>
  ): void {
    const callback = typeof opts === 'function' ? opts : cb;
    const options = typeof opts === 'object' ? opts : null;
    this._get(index, options)
      .then(buffer => callback?.(null, buffer))
      .catch(err => callback?.(err));
  }

  private async _close(): Promise<void> {
    if (this.closed) throw new Error('Storage is closed');
    this.closed = true;

    const tasks = this.files
      .filter(file => file.isOpen())
      .map(({ open }: FileDescriptor) => {
        return open().then(
          (file: RAF) => {
            return new Promise<void>((resolve, reject) => {
              file.close(err => {
                if (err) return reject(err);
                resolve();
              });
            });
          },
          () => null
        );
      });
    await Promise.all(tasks);
  }

  public close(cb?: Callback): void {
    this._close()
      .then(() => cb?.(null))
      .catch(err => cb?.(err));
  }

  /**
   * Delete the encrypted files of the named content paths, leaving the others untouched. Open
   * handles are closed first and reopen on demand, so the store keeps working: pieces written
   * later (a boundary piece shared with a neighbor) recreate the file. A physical file that
   * another, kept path maps to is not deleted.
   */
  public async removeFiles(logicalPaths: string[]): Promise<void> {
    if (this.closed) throw new Error('Storage is closed');
    const removed = new Set(logicalPaths);
    const targets = this.files.filter(file => removed.has(file.logicalPath));
    const kept = new Set(
      this.files.filter(file => !removed.has(file.logicalPath)).map(file => file.path)
    );
    await Promise.all(
      targets.map(file =>
        file.remove(async () => {
          if (!kept.has(file.path)) await rm(file.path, { force: true, maxRetries: 10 });
        })
      )
    );
  }

  private async _destroy(): Promise<void> {
    await this._close();

    if (this.addUID && this.path) {
      await rm(path.resolve(path.join(this.path, this.name)), { recursive: true });
    } else {
      const tasks = this.files.map(async file => {
        try {
          await rm(file.path, { recursive: true, maxRetries: 10 });
        } catch (err) {
          if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
            // File does not exist, ignore
            return;
          }
          throw err;
        }
      });
      await Promise.all(tasks);
    }
  }

  public destroy(cb?: Callback): void {
    this._destroy()
      .then(() => cb?.(null))
      .catch(err => cb?.(err));
  }
}
