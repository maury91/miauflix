import type { DataSource } from 'typeorm';

/**
 * Columns renamed in place, before `synchronize()`: on SQLite, synchronize treats a renamed
 * column as dropped and added and rebuilds the table without it, losing the data. Renaming
 * first keeps the data; it is idempotent, so it runs on every startup.
 */
export const COLUMN_RENAMES: ReadonlyArray<{ table: string; from: string; to: string }> = [
  // Encrypted columns get names that do not describe them (see EncryptedColumns).
  { table: 'media_probe', from: 'filePath', to: 'k' },
  { table: 'media_probe', from: 'result', to: 'v' },
  { table: 'movie_source', from: 'videoFilePath', to: 'k' },
  { table: 'episode_source', from: 'videoFilePath', to: 'k' },
  { table: 'storage_file', from: 'path', to: 'k' },
  { table: 'storage_file_claim', from: 'path', to: 'k' },
  { table: 'recent_searches', from: 'queryKey', to: 'k' },
  { table: 'recent_searches', from: 'query', to: 'v' },
  { table: 'notification', from: 'title', to: 'a' },
  { table: 'notification', from: 'message', to: 'b' },
];

export async function renameColumns(
  dataSource: DataSource,
  renames = COLUMN_RENAMES
): Promise<void> {
  for (const { table, from, to } of renames) {
    const columns = (await dataSource.query(`PRAGMA table_info("${table}")`)) as Array<{
      name: string;
    }>;
    const names = new Set(columns.map(column => column.name));
    if (names.has(from) && !names.has(to)) {
      await dataSource.query(`ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"`);
    }
  }
}
