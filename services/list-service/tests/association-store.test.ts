import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { disconnectAssociation, replaceAssociation } from '../src/association-store';

const setup = () => {
  const database = new Database(':memory:');
  database.run(`CREATE TABLE associations (
    subject_id TEXT PRIMARY KEY, account_id TEXT NOT NULL UNIQUE, username TEXT,
    access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, expires_at INTEGER NOT NULL,
    connection_id TEXT NOT NULL
  )`);
  database.run(`CREATE TABLE list_pages (
    subject_id TEXT NOT NULL, list_id TEXT NOT NULL, page INTEGER NOT NULL,
    payload TEXT NOT NULL, fetched_at INTEGER NOT NULL,
    PRIMARY KEY (subject_id, list_id, page)
  )`);
  const seed = database.transaction(() => {
    for (const subjectId of ['subject-a', 'subject-b', 'subject-c', '']) {
      database
        .query('INSERT INTO list_pages VALUES (?1, ?2, 1, ?3, ?4)')
        .run(subjectId, 'trakt-watchlist-movies', subjectId, Date.now());
    }
    database
      .query('INSERT INTO associations VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .run('subject-a', 'account-x', 'A', 'a', 'a', Date.now() + 1_000_000, 'old-a');
    database
      .query('INSERT INTO associations VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .run('subject-b', 'account-b', 'B', 'b', 'b', Date.now() + 1_000_000, 'old-b');
  });
  seed();
  return database;
};

describe('Trakt association cache ownership', () => {
  it('clears pages for the replaced subject and an account-displaced subject only', () => {
    const database = setup();
    replaceAssociation(database, {
      subjectId: 'subject-b',
      accountId: 'account-x',
      username: 'B2',
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: Date.now() + 1_000_000,
      connectionId: 'new-b',
    });

    expect(database.query('SELECT subject_id FROM list_pages ORDER BY subject_id').all()).toEqual([
      { subject_id: '' },
      { subject_id: 'subject-c' },
    ]);
    expect(
      database.query('SELECT subject_id, account_id, connection_id FROM associations').all()
    ).toEqual([{ subject_id: 'subject-b', account_id: 'account-x', connection_id: 'new-b' }]);
    database.close();
  });

  it('deletes a disconnected subject association and pages atomically', () => {
    const database = setup();
    disconnectAssociation(database, 'subject-a');
    expect(
      database.query('SELECT * FROM associations WHERE subject_id = ?1').all('subject-a')
    ).toEqual([]);
    expect(database.query('SELECT subject_id FROM list_pages ORDER BY subject_id').all()).toEqual([
      { subject_id: '' },
      { subject_id: 'subject-b' },
      { subject_id: 'subject-c' },
    ]);
    database.close();
  });
});
