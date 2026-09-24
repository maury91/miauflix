import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { listPage } from '../src/list-page-cache';

const setup = () => {
  const database = new Database(':memory:');
  database.run(`CREATE TABLE list_pages (
    subject_id TEXT NOT NULL, list_id TEXT NOT NULL, page INTEGER NOT NULL,
    payload TEXT NOT NULL, fetched_at INTEGER NOT NULL,
    PRIMARY KEY (subject_id, list_id, page)
  )`);
  let connection: { connection_id: string } | null = { connection_id: 'account-a' };
  const fetchPage = async (_path: string) => ({
    items: [{ movie: { ids: { trakt: 1, tmdb: 10 } } }],
    totalItems: 1,
    totalPages: 1,
  });
  const call = (overrides: Partial<Parameters<typeof listPage>[0]> = {}) =>
    listPage({
      database,
      listId: 'trakt-watchlist-movies',
      subjectId: 'user-1',
      page: 1,
      association: () => connection,
      accessToken: async (_subject, id) => {
        if (connection?.connection_id !== id) throw new Error('Trakt account connection changed');
        return 'token';
      },
      fetchPage,
      seal: value => value,
      open: value => value,
      ...overrides,
    });
  return { database, call, setConnection: (next: typeof connection) => (connection = next) };
};

describe('personal Trakt list page cache', () => {
  it('requires a live association before serving a fresh cached personal page', async () => {
    const { database, call, setConnection } = setup();
    await call();
    database.query('UPDATE list_pages SET fetched_at = ?1').run(Date.now());
    setConnection(null);
    await expect(call()).rejects.toThrow('not connected');
    database.close();
  });

  it('does not use an expired personal cache as a disconnected fallback', async () => {
    const { database, call, setConnection } = setup();
    await call();
    database.query('UPDATE list_pages SET fetched_at = 0').run();
    setConnection(null);
    await expect(call()).rejects.toThrow('not connected');
    database.close();
  });

  it('does not return or cache a page fetched under a replaced account', async () => {
    const { database, call, setConnection } = setup();
    let finish!: (value: { items: unknown[]; totalItems: number; totalPages: number }) => void;
    const pending = call({
      fetchPage: () => new Promise(resolve => (finish = resolve)),
    });
    await Promise.resolve();
    setConnection({ connection_id: 'account-b' });
    finish({ items: [{ movie: { ids: { trakt: 2, tmdb: 20 } } }], totalItems: 1, totalPages: 1 });
    await expect(pending).rejects.toThrow('connection changed');
    expect(database.query('SELECT COUNT(*) AS count FROM list_pages').get()).toEqual({ count: 0 });
    database.close();
  });

  it('serves an expired personal page after a provider timeout while its account remains connected', async () => {
    const { database, call } = setup();
    const cached = await call();
    database.query('UPDATE list_pages SET fetched_at = 0').run();
    const stale = await call({
      fetchPage: async () => {
        throw new Error('provider unavailable');
      },
    });
    expect(stale).toEqual(cached);
    database.close();
  });

  it('serves stale public pages after provider failure', async () => {
    const { database } = setup();
    const first = await listPage({
      database,
      listId: 'trakt-movies-popular',
      subjectId: 'user-1',
      page: 1,
      association: () => null,
      accessToken: async () => 'unused',
      fetchPage: async () => ({
        items: [{ ids: { trakt: 3, tmdb: 30 } }],
        totalItems: 1,
        totalPages: 1,
      }),
      seal: value => value,
      open: value => value,
    });
    expect(database.query('SELECT subject_id FROM list_pages').get()).toEqual({ subject_id: '' });
    database.query('UPDATE list_pages SET fetched_at = 0').run();
    const stale = await listPage({
      database,
      listId: 'trakt-movies-popular',
      page: 1,
      association: () => null,
      accessToken: async () => 'unused',
      fetchPage: async () => {
        throw new Error('provider unavailable');
      },
      seal: value => value,
      open: value => value,
    });
    expect(stale).toEqual(first);
    database.close();
  });
});
