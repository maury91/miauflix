import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { RecentSearch } from '@entities/recent-search.entity';
import type { SearchRecentKind } from '@routes/search.types';

export const MAX_RECENT_SEARCHES = 10;

const queryKey = (query: string) => query.trim().toLocaleLowerCase();

export class RecentSearchRepository {
  private readonly repository: Repository<RecentSearch>;

  constructor(database: Database) {
    this.repository = database.getRepository(RecentSearch);
  }

  list(userId: string, limit = MAX_RECENT_SEARCHES): Promise<RecentSearch[]> {
    return this.repository.find({
      where: { userId },
      order: { searchedAt: 'DESC' },
      take: limit,
    });
  }

  /** Upserts the search as the most recent one and drops entries beyond the limit. */
  async record(userId: string, kind: SearchRecentKind, query: string, now = new Date()) {
    const trimmed = query.trim();
    await this.repository.upsert(
      { userId, kind, queryKey: queryKey(trimmed), query: trimmed, searchedAt: now },
      ['userId', 'kind', 'queryKey']
    );
    // At most one entry over the limit exists here, so loading the user's rows stays cheap.
    const entries = await this.repository.find({
      where: { userId },
      order: { searchedAt: 'DESC' },
    });
    for (const entry of entries.slice(MAX_RECENT_SEARCHES)) {
      await this.repository.delete({ userId, kind: entry.kind, queryKey: entry.queryKey });
    }
  }

  async remove(userId: string, kind: SearchRecentKind, query: string): Promise<void> {
    await this.repository.delete({ userId, kind, queryKey: queryKey(query) });
  }
}
