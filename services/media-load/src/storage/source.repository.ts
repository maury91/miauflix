import type { Database } from 'bun:sqlite';

import type { Encryption } from '../lib/encryption';
import type { ContentSource } from './types';

/** Decrypted descriptors kept in memory; torrent files can be large, so the cache is bounded. */
const CACHE_LIMIT = 256;

interface SourceRow {
  id: number;
  descriptor: string;
  file: Uint8Array | null;
}

/**
 * Source descriptors the host sent. They are encrypted at rest, as in the backend database;
 * decrypted descriptors are cached because every engine call looks one up.
 */
export class SourceRepository {
  private readonly cache = new Map<number, ContentSource>();

  constructor(
    private readonly db: Database,
    private readonly encryption: Encryption
  ) {}

  /** Store or replace a descriptor. A descriptor without a file keeps a file stored earlier. */
  async put(source: ContentSource): Promise<void> {
    const descriptor = this.encryption.encryptString(
      JSON.stringify({ hash: source.hash, magnetLink: source.magnetLink, size: source.size })
    );
    const file = source.file ? this.encryption.encryptBuffer(source.file) : null;
    this.db
      .query(
        `INSERT INTO source (id, descriptor, file, updatedAt) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET descriptor = excluded.descriptor,
           file = COALESCE(excluded.file, source.file), updatedAt = excluded.updatedAt`
      )
      .run(source.id, descriptor, file, Date.now());
    this.cache.delete(source.id);
  }

  async findById(id: number): Promise<ContentSource | null> {
    return this.findByIdSync(id);
  }

  findByIdSync(id: number): ContentSource | null {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const row = this.db
      .query<SourceRow, [number]>('SELECT id, descriptor, file FROM source WHERE id = ?')
      .get(id);
    if (!row) return null;
    const descriptor = JSON.parse(this.encryption.decryptString(row.descriptor)) as Omit<
      ContentSource,
      'file' | 'id'
    >;
    const source: ContentSource = {
      id: row.id,
      ...descriptor,
      ...(row.file ? { file: this.encryption.decryptBuffer(row.file) } : {}),
    };
    if (this.cache.size >= CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(id, source);
    return source;
  }
}
