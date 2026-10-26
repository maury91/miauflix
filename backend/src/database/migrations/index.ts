import { backfillStreamingScores } from './backfill-streaming-scores.migration';
import type { Migration } from './migration.types';

/**
 * Data migrations in the order they run. Append only: a released entry is never edited,
 * reordered or removed, because a database's version is its index into this list.
 */
export const migrations: readonly Migration[] = [backfillStreamingScores];
