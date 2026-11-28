import type { MigrationInterface } from 'typeorm';

import { AddLanguagePreferences1795286483967 } from './AddLanguagePreferences1795286483967';
import { AddMediaVariant1794649236030 } from './AddMediaVariant1794649236030';
import { AddWatchOnce1795843200000 } from './AddWatchOnce1795843200000';
import { Baseline1794506434316 } from './Baseline1794506434316';

export type SchemaMigration = new () => MigrationInterface;

/**
 * Schema migrations in the order they run. Generate a new one after changing an entity with
 * `bun run db:migration <Name>` (from backend/); it is added to the end of this list.
 * Append only: a released migration is never edited, reordered or removed.
 */
export const schemaMigrations: SchemaMigration[] = [
  Baseline1794506434316,
  AddMediaVariant1794649236030,
  AddLanguagePreferences1795286483967,
  AddWatchOnce1795843200000,
];
