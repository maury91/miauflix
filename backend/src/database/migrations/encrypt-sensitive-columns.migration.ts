import { EncryptedColumns } from '@utils/encrypted-column.util';

import type { Migration } from './migration.types';

/** Every encrypted column, by its stored name; renamed beforehand by renameColumns(). */
export const ENCRYPTED_COLUMNS: ReadonlyArray<{
  table: string;
  column: string;
  deterministic: boolean;
}> = [
  { table: 'media_probe', column: 'k', deterministic: true },
  { table: 'media_probe', column: 'v', deterministic: false },
  { table: 'movie_source', column: 'k', deterministic: true },
  { table: 'episode_source', column: 'k', deterministic: true },
  { table: 'storage_file', column: 'k', deterministic: true },
  { table: 'storage_file_claim', column: 'k', deterministic: true },
  { table: 'recent_searches', column: 'k', deterministic: true },
  { table: 'recent_searches', column: 'v', deterministic: false },
  { table: 'notification', column: 'a', deterministic: false },
  { table: 'notification', column: 'b', deterministic: false },
];

/**
 * Encrypt the file paths, probe output, searches and notification titles stored in plain text
 * before these columns were encrypted. Values that already decrypt are skipped, so a second run
 * changes nothing. Deterministic encryption maps distinct values to distinct ciphertexts, so
 * unique constraints still hold.
 */
export const encryptSensitiveColumns: Migration = async ({ db, logger }) => {
  await db.transaction(async manager => {
    for (const { table, column, deterministic } of ENCRYPTED_COLUMNS) {
      const rows = (await manager.query(
        `SELECT rowid AS id, "${column}" AS value FROM "${table}" WHERE "${column}" IS NOT NULL`
      )) as Array<{ id: number; value: string }>;
      let encrypted = 0;
      for (const { id, value } of rows) {
        if (EncryptedColumns.isEncrypted(value)) continue;
        await manager.query(`UPDATE "${table}" SET "${column}" = ? WHERE rowid = ?`, [
          EncryptedColumns.encrypt(value, deterministic),
          id,
        ]);
        encrypted++;
      }
      if (encrypted) logger.info('Migrations', `Encrypted ${encrypted} values in ${table}`);
    }
  });
};
