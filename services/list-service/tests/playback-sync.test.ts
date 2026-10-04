import type { PlaybackProgress } from '@miauflix/service-contracts';
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { PlaybackSync } from '../src/playback-sync';
import type { TraktClient } from '../src/trakt-client';

const update: PlaybackProgress = {
  playable: { kind: 'movie', mediaId: 123 },
  positionSeconds: 20,
  durationSeconds: 100,
  state: 'playing',
};
const setupTest = () => {
  const database = new Database(':memory:');
  database.run('CREATE TABLE associations (subject_id TEXT PRIMARY KEY, connection_id TEXT)');
  database.run("INSERT INTO associations VALUES ('user', 'first')");
  const writes: PlaybackProgress[] = [];
  let reads = 0;
  const client = {
    watchedHistory: async () => [],
    nextEpisodes: async () => [],
    playback: async () => {
      reads++;
      return [{ ...update, state: 'paused', updatedAt: '2026-10-04T10:00:00Z' }];
    },
    scrobble: async (value: PlaybackProgress) => {
      writes.push(value);
    },
  } as unknown as TraktClient;
  const create = () =>
    new PlaybackSync(
      database,
      () => client,
      subjectId =>
        database
          .query('SELECT connection_id FROM associations WHERE subject_id = ?1')
          .get(subjectId) as { connection_id: string } | null,
      async () => 'token',
      value => `sealed:${value}`,
      value => value.slice(7)
    );
  return {
    database,
    sync: create(),
    create,
    client,
    writes,
    reads: () => reads,
    setConnection: (id: string | null) => {
      database.run('DELETE FROM associations');
      if (id) database.query('INSERT INTO associations VALUES (?1, ?2)').run('user', id);
    },
  };
};

describe('background playback sync', () => {
  it('acknowledges immediately, coalesces frequent updates, and sends pause and completion', async () => {
    const { sync, writes } = setupTest();
    expect(sync.write('user', update)).toBe(true);
    sync.write('user', { ...update, positionSeconds: 25 });
    expect(writes).toEqual([]);
    await sync.tick();
    expect(writes.map(value => value.positionSeconds)).toEqual([25]);
    sync.write('user', update);
    await sync.tick();
    expect(writes.length).toBe(1);
    sync.write('user', { ...update, state: 'paused' });
    await sync.tick();
    sync.write('user', { ...update, state: 'completed' });
    await sync.tick();
    expect(writes.map(value => value.state)).toEqual(['playing', 'paused', 'completed']);
  });

  it('persists encrypted pending updates and resumes them after worker restart', async () => {
    const { sync, database, create, writes } = setupTest();
    sync.write('user', { ...update, state: 'paused' });
    const row = database.query('SELECT payload FROM playback_outbox').get() as { payload: string };
    expect(row.payload.startsWith('sealed:')).toBe(true);
    await create().tick();
    expect(writes.length).toBe(1);
    expect(database.query('SELECT COUNT(*) AS count FROM playback_outbox').get()).toEqual({
      count: 0,
    });
  });

  it('retains failed updates for retry after restart', async () => {
    const { sync, database, create, client, writes } = setupTest();
    client.scrobble = async () => {
      throw new Error('unavailable');
    };
    sync.write('user', update);
    await sync.tick();
    expect(database.query('SELECT COUNT(*) AS count FROM playback_outbox').get()).toEqual({
      count: 1,
    });
    client.scrobble = async value => {
      writes.push(value);
    };
    await create().tick();
    expect(writes.length).toBe(1);
  });

  it('serves background snapshots without provider calls and discards disconnected account work', async () => {
    const { sync, reads, writes, setConnection } = setupTest();
    expect(sync.read('user')).toEqual([]);
    await sync.tick();
    expect(sync.read('user').length).toBe(1);
    await sync.tick();
    expect(reads()).toBe(1);
    sync.write('user', update);
    expect(sync.read('user')).toEqual([]);
    setConnection(null);
    expect(sync.read('user')).toEqual([]);
    await sync.tick();
    expect(writes).toEqual([]);
    setConnection('second');
    expect(sync.read('user')).toEqual([]);
  });

  it('does not lose an update received while the provider is processing an older position', async () => {
    const { sync, client, database } = setupTest();
    client.scrobble = async () => {
      sync.write('user', { ...update, state: 'paused', positionSeconds: 50 });
    };
    sync.write('user', update);
    await sync.tick();
    expect(database.query('SELECT COUNT(*) AS count FROM playback_outbox').get()).toEqual({
      count: 1,
    });
    expect(sync.read('user')).toEqual([]);
  });

  it('rejects a snapshot fetched under a replaced connection', async () => {
    const { sync, client, setConnection } = setupTest();
    client.playback = async () => {
      setConnection('second');
      return [];
    };
    await sync.tick();
    expect(sync.read('user')).toEqual([]);
  });

  it('lets a newer Trakt completion replace paused playback', async () => {
    const { sync, client } = setupTest();
    client.watchedHistory = async () => [
      { ...update, state: 'completed', updatedAt: '2026-10-04T11:00:00Z' },
    ];
    await sync.tick();
    expect(sync.read('user')[0].state).toBe('completed');
  });
});
