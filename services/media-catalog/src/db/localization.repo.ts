import { and, eq, inArray, sql } from 'drizzle-orm';

import type { TranslationRow } from './catalog-db.types';
import type { CatalogDatabase } from './database';
import { genres, mediaGenres, translations } from './schema';

/** Persistence operations for genres and localized metadata. */
export class LocalizationRepository {
  constructor(private readonly database: CatalogDatabase) {}

  private get db() {
    return this.database.db;
  }

  localizedGenreNames(
    mediaType: 'movie' | 'tv',
    mediaId: number,
    language: string,
    defaultLanguage: string
  ): Array<{ id: number; name: string }> {
    const rows = this.db
      .select({
        id: mediaGenres.genreId,
        name: sql<string>`coalesce((select t.title from translations t where t.entity_type = 'genre' and t.entity_id = ${mediaGenres.genreId} and t.language = ${language}), (select t.title from translations t where t.entity_type = 'genre' and t.entity_id = ${mediaGenres.genreId} and t.language = ${defaultLanguage}), (select t.title from translations t where t.entity_type = 'genre' and t.entity_id = ${mediaGenres.genreId} limit 1), '')`,
      })
      .from(mediaGenres)
      .where(and(eq(mediaGenres.mediaType, mediaType), eq(mediaGenres.mediaId, mediaId)))
      .all();
    return rows.map(row => ({ id: row.id, name: row.name || `Genre ${row.id}` }));
  }

  genreIdsOf(mediaType: 'movie' | 'tv', mediaId: number): number[] {
    return this.db
      .select({ genreId: mediaGenres.genreId })
      .from(mediaGenres)
      .where(and(eq(mediaGenres.mediaType, mediaType), eq(mediaGenres.mediaId, mediaId)))
      .all()
      .map(row => row.genreId);
  }

  genresCoverLanguage(ids: number[], language: string): boolean {
    if (!ids.length) return true;
    return (
      (this.db
        .select({ total: sql<number>`count(distinct ${translations.entityId})` })
        .from(translations)
        .where(
          and(
            eq(translations.entityType, 'genre'),
            eq(translations.language, language),
            inArray(translations.entityId, ids)
          )
        )
        .get()?.total ?? 0) >= ids.length
    );
  }

  upsertGenres(values: Array<{ id: number; name: string }>, language: string): void {
    this.db.transaction(tx => {
      for (const genre of values) {
        tx.insert(genres).values({ id: genre.id }).onConflictDoNothing().run();
        tx.insert(translations)
          .values({
            entityType: 'genre',
            entityId: genre.id,
            language,
            title: genre.name,
            overview: '',
            tagline: '',
          })
          .onConflictDoUpdate({
            target: [translations.entityType, translations.entityId, translations.language],
            set: { title: genre.name },
          })
          .run();
      }
    });
  }

  getTranslations(entityType: 'movie' | 'tv', entityId: number): TranslationRow[] {
    return this.db
      .select({
        language: translations.language,
        title: translations.title,
        overview: translations.overview,
        tagline: translations.tagline,
      })
      .from(translations)
      .where(and(eq(translations.entityType, entityType), eq(translations.entityId, entityId)))
      .all();
  }
}
