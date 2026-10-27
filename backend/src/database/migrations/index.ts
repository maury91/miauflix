import { backfillStreamingScores } from './backfill-streaming-scores.migration';
import { encryptSensitiveColumns } from './encrypt-sensitive-columns.migration';
import type { Migration } from './migration.types';
import { vacuumPlaintext } from './vacuum-plaintext.migration';

/**
 * Data migrations in the order they run. Append only: a released entry is never edited,
 * reordered or removed, because a database's version is its index into this list.
 */
export const migrations: readonly Migration[] = [
  backfillStreamingScores,
  encryptSensitiveColumns,
  vacuumPlaintext,
];
