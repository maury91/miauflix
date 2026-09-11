import { and, eq, sql } from 'drizzle-orm';

import type { CatalogDatabase } from './database';
import { mediaGenres, translations } from './schema';

export type CatalogTx = Parameters<Parameters<CatalogDatabase['db']['transaction']>[0]>[0];

export const replaceGenres = (
  tx: CatalogTx,
  mediaType: 'movie' | 'tv',
  mediaId: number,
  genreIds: number[]
) => {
  tx.delete(mediaGenres)
    .where(and(eq(mediaGenres.mediaType, mediaType), eq(mediaGenres.mediaId, mediaId)))
    .run();
  if (genreIds.length)
    tx.insert(mediaGenres)
      .values(genreIds.map(genreId => ({ mediaType, mediaId, genreId })))
      .onConflictDoNothing()
      .run();
};

export const replaceTranslations = (
  tx: CatalogTx,
  entityType: 'movie' | 'tv',
  entityId: number,
  values: Array<{ language: string; title: string; overview: string; tagline: string }>
) => {
  tx.delete(translations)
    .where(and(eq(translations.entityType, entityType), eq(translations.entityId, entityId)))
    .run();
  const rows = values
    .filter(value => value.language)
    .map(value => ({ entityType, entityId, ...value }));
  if (rows.length)
    tx.insert(translations)
      .values(rows)
      .onConflictDoUpdate({
        target: [translations.entityType, translations.entityId, translations.language],
        set: {
          title: sql`excluded.title`,
          overview: sql`excluded.overview`,
          tagline: sql`excluded.tagline`,
        },
      })
      .run();
};
