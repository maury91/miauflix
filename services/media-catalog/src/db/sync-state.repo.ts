import { eq } from 'drizzle-orm';

import type { CatalogDatabase } from './database';
import { syncState } from './schema';

/** Persistence operations for background synchronization watermarks. */
export class SyncStateRepository {
  constructor(private readonly database: CatalogDatabase) {}

  private get db() {
    return this.database.db;
  }

  getLastSync(name: string): Date | null {
    const row = this.db
      .select({ lastSync: syncState.lastSync })
      .from(syncState)
      .where(eq(syncState.name, name))
      .get();
    return row?.lastSync ? new Date(row.lastSync) : null;
  }

  setLastSync(name: string, date: Date): void {
    this.db
      .insert(syncState)
      .values({ name, lastSync: date.getTime() })
      .onConflictDoUpdate({ target: syncState.name, set: { lastSync: date.getTime() } })
      .run();
  }
}
