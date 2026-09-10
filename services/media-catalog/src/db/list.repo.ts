import { and, eq, lte } from 'drizzle-orm';

import type { ListDefinition } from './catalog-db.types';
import type { CatalogDatabase } from './database';
import { listPages, lists } from './schema';

/** Persistence operations for provider list definitions and page caches. */
export class ListRepository {
  constructor(private readonly database: CatalogDatabase) {}

  private get db() {
    return this.database.db;
  }

  upsertListDefinitions(definitions: ListDefinition[], provider: string): void {
    this.db.transaction(tx => {
      for (const definition of definitions)
        tx.insert(lists)
          .values({
            slug: definition.slug,
            name: definition.name,
            description: definition.description,
            provider,
          })
          .onConflictDoUpdate({
            target: lists.slug,
            set: { name: definition.name, description: definition.description, provider },
          })
          .run();
    });
  }

  listDefinitions(): ListDefinition[] {
    return this.db
      .select({ slug: lists.slug, name: lists.name, description: lists.description })
      .from(lists)
      .all();
  }

  getCachedListPage(
    slug: string,
    page: number,
    language: string,
    ttlMs: number
  ): { items: unknown; totalPages: number; totalItems: number } | undefined {
    const row = this.db
      .select()
      .from(listPages)
      .where(
        and(eq(listPages.slug, slug), eq(listPages.page, page), eq(listPages.language, language))
      )
      .get();
    if (!row || Date.now() - row.fetchedAt >= ttlMs) return undefined;
    return {
      items: JSON.parse(row.itemsJson),
      totalPages: row.totalPages,
      totalItems: row.totalItems,
    };
  }

  putCachedListPage(
    slug: string,
    page: number,
    language: string,
    data: { items: unknown; totalPages: number; totalItems: number },
    ttlMs = 36e5
  ): void {
    const fetchedAt = Date.now();
    this.db
      .delete(listPages)
      .where(lte(listPages.fetchedAt, fetchedAt - ttlMs))
      .run();
    this.db
      .insert(listPages)
      .values({
        slug,
        page,
        language,
        itemsJson: JSON.stringify(data.items),
        totalPages: data.totalPages,
        totalItems: data.totalItems,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: [listPages.slug, listPages.page, listPages.language],
        set: {
          itemsJson: JSON.stringify(data.items),
          totalPages: data.totalPages,
          totalItems: data.totalItems,
          fetchedAt,
        },
      })
      .run();
  }
}
