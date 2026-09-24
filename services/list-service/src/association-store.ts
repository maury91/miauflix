import type { Database } from 'bun:sqlite';

export const replaceAssociation = (
  database: Database,
  association: {
    subjectId: string;
    accountId: string;
    username: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    connectionId: string;
  }
): void => {
  const transaction = database.transaction(() => {
    const displaced = database
      .query('SELECT subject_id FROM associations WHERE subject_id = ?1 OR account_id = ?2')
      .all(association.subjectId, association.accountId) as Array<{ subject_id: string }>;
    for (const row of displaced) {
      database.query('DELETE FROM list_pages WHERE subject_id = ?1').run(row.subject_id);
    }
    database
      .query('DELETE FROM associations WHERE subject_id = ?1 OR account_id = ?2')
      .run(association.subjectId, association.accountId);
    database
      .query('INSERT INTO associations VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .run(
        association.subjectId,
        association.accountId,
        association.username,
        association.accessToken,
        association.refreshToken,
        association.expiresAt,
        association.connectionId
      );
  });
  transaction();
};

export const disconnectAssociation = (database: Database, subjectId: string): void => {
  const transaction = database.transaction(() => {
    database.query('DELETE FROM associations WHERE subject_id = ?1').run(subjectId);
    database.query('DELETE FROM list_pages WHERE subject_id = ?1').run(subjectId);
  });
  transaction();
};
