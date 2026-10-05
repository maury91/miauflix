import type { PlaybackEntry, PlaybackProgress } from '@miauflix/service-contracts';
import { playbackSnapshotSchema, playbackSyncSchema } from '@miauflix/service-contracts';
import type { Database } from 'bun:sqlite';

import type { TraktClient } from './trakt-client';

type Pending = { id: string; subject_id: string; connection_id: string; payload: string };

/** Durable, encrypted outbox. Provider traffic never blocks a local progress save. */
export class PlaybackSync {
  private running = false;
  private readonly lastWrites = new Map<string, { key: string; state: string; at: number }>();
  private readonly lastReads = new Map<string, number>();
  private readonly retries = new Map<string, number>();

  constructor(
    private readonly database: Database,
    private readonly client: () => TraktClient,
    private readonly association: (subjectId: string) => { connection_id: string } | null,
    private readonly token: (subjectId: string, connectionId: string) => Promise<string>,
    private readonly seal: (value: string) => string,
    private readonly open: (value: string) => string
  ) {
    database.run(`CREATE TABLE IF NOT EXISTS playback_outbox (
      id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, connection_id TEXT NOT NULL,
      payload TEXT NOT NULL, revision TEXT NOT NULL, queued_at INTEGER NOT NULL
    )`);
    database.run(`CREATE TABLE IF NOT EXISTS playback_snapshots (
      subject_id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, payload TEXT NOT NULL
    )`);
  }

  /**
   * Read the current connection’s cached playback, excluding playables with pending local exports.
   * Return an empty list without a connection or snapshot. Database, decryption, JSON, and schema
   * validation errors propagate; this method does not contact Trakt.
   */
  read(subjectId: string): PlaybackEntry[] {
    const connectionId = this.association(subjectId)?.connection_id;
    if (!connectionId) return [];
    const row = this.database
      .query('SELECT payload FROM playback_snapshots WHERE subject_id = ?1 AND connection_id = ?2')
      .get(subjectId, connectionId) as { payload: string } | null;
    const pending = this.database
      .query('SELECT payload FROM playback_outbox WHERE subject_id = ?1 AND connection_id = ?2')
      .all(subjectId, connectionId) as Array<{ payload: string }>;
    const pendingKeys = new Set(
      pending.map(item =>
        JSON.stringify(playbackSyncSchema.parse(JSON.parse(this.open(item.payload))).playable)
      )
    );
    // A delayed provider timestamp must never hide a newer local update awaiting export.
    return row
      ? playbackSnapshotSchema
          .parse(JSON.parse(this.open(row.payload)))
          .progress.filter(entry => !pendingKeys.has(JSON.stringify(entry.playable)))
      : [];
  }

  /**
   * Queue encrypted progress for the current connection without contacting Trakt.
   * Replace pending positions for the same playable, but keep completions as separate events.
   * Return false when disconnected, otherwise true after queuing; database and encryption errors propagate.
   */
  write(subjectId: string, update: PlaybackProgress): boolean {
    const connectionId = this.association(subjectId)?.connection_id;
    if (!connectionId) return false;
    const key = JSON.stringify(update.playable);
    // Frequent position reports replace pending positions. Completions remain separate events.
    const id =
      update.state === 'completed' ? crypto.randomUUID() : `${subjectId}:${connectionId}:${key}`;
    this.database
      .query(
        `INSERT INTO playback_outbox VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, revision = excluded.revision, queued_at = excluded.queued_at`
      )
      .run(
        id,
        subjectId,
        connectionId,
        this.seal(JSON.stringify({ subjectId, ...update })),
        crypto.randomUUID(),
        Date.now()
      );
    return true;
  }

  /**
   * Export queued progress and refresh connected accounts’ encrypted playback snapshots.
   * Overlapping calls return immediately. Consecutive playing exports for the same playable wait
   * a minute; successful exports invalidate the one-minute snapshot read cache. Account failures
   * retain pending data and delay retries a minute.
   * Discard work for replaced connections. Failures outside per-account handling, including reading
   * or decoding the outbox, propagate; the running guard is released even on failure.
   */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const pending = this.database
        .query('SELECT * FROM playback_outbox ORDER BY queued_at')
        .all() as (Pending & { revision: string })[];
      for (const row of pending) {
        if (this.association(row.subject_id)?.connection_id !== row.connection_id) {
          this.database.query('DELETE FROM playback_outbox WHERE id = ?1').run(row.id);
          continue;
        }
        const accountKey = `${row.subject_id}:${row.connection_id}`;
        if ((this.retries.get(accountKey) ?? 0) > Date.now()) continue;
        const update = playbackSyncSchema.parse(JSON.parse(this.open(row.payload)));
        const key = JSON.stringify(update.playable);
        const last = this.lastWrites.get(accountKey);
        if (
          update.state === 'playing' &&
          last?.key === key &&
          last.state === 'playing' &&
          last.at + 60_000 > Date.now()
        )
          continue;
        try {
          const token = await this.token(row.subject_id, row.connection_id);
          if (this.association(row.subject_id)?.connection_id !== row.connection_id) continue;
          await this.client().scrobble(update, token);
          this.database
            .query('DELETE FROM playback_outbox WHERE id = ?1 AND revision = ?2')
            .run(row.id, row.revision);
          this.lastWrites.set(accountKey, { key, state: update.state, at: Date.now() });
          this.lastReads.delete(accountKey);
          this.retries.delete(accountKey);
        } catch (error) {
          this.retries.set(accountKey, Date.now() + 60_000);
          console.warn(
            'Trakt playback export failed; queued update retained for retry',
            error instanceof Error ? error.message.split(':')[0] : 'Unknown error'
          );
        }
      }
      const accounts = this.database
        .query('SELECT subject_id, connection_id FROM associations')
        .all() as Array<{ subject_id: string; connection_id: string }>;
      for (const account of accounts) {
        const key = `${account.subject_id}:${account.connection_id}`;
        if (
          (this.retries.get(key) ?? 0) > Date.now() ||
          (this.lastReads.get(key) ?? 0) + 60_000 > Date.now()
        )
          continue;
        try {
          const token = await this.token(account.subject_id, account.connection_id);
          if (this.association(account.subject_id)?.connection_id !== account.connection_id)
            continue;
          const paused = await this.client().playback(token);
          const snapshot = this.database
            .query(
              'SELECT payload FROM playback_snapshots WHERE subject_id = ?1 AND connection_id = ?2'
            )
            .get(account.subject_id, account.connection_id) as { payload: string } | null;
          const previous = snapshot
            ? playbackSnapshotSchema
                .parse(JSON.parse(this.open(snapshot.payload)))
                .progress.filter(entry => entry.state === 'completed')
            : [];
          const since = previous.reduce<string | undefined>(
            (latest, entry) =>
              !latest || Date.parse(entry.updatedAt) > Date.parse(latest)
                ? entry.updatedAt
                : latest,
            undefined
          );
          const completed = await this.client().watchedHistory(token, since);
          const nextEpisodes = await this.client().nextEpisodes(token);
          const latest = new Map<string, PlaybackEntry>();
          for (const entry of [...nextEpisodes, ...previous, ...completed, ...paused]) {
            const identity = JSON.stringify(entry.playable);
            const old = latest.get(identity);
            if (!old || Date.parse(entry.updatedAt) > Date.parse(old.updatedAt))
              latest.set(identity, entry);
          }
          const entries = [...latest.values()];
          if (this.association(account.subject_id)?.connection_id !== account.connection_id)
            continue;
          this.database
            .query(
              `INSERT INTO playback_snapshots VALUES (?1, ?2, ?3)
            ON CONFLICT(subject_id) DO UPDATE SET connection_id = excluded.connection_id, payload = excluded.payload`
            )
            .run(
              account.subject_id,
              account.connection_id,
              this.seal(JSON.stringify({ progress: entries }))
            );
          this.lastReads.set(key, Date.now());
        } catch (error) {
          this.retries.set(key, Date.now() + 60_000);
          console.warn(
            'Trakt playback import failed; previous account snapshot retained',
            error instanceof Error ? error.message.split(':')[0] : 'Unknown error'
          );
        }
      }
      this.database.run(
        'DELETE FROM playback_snapshots WHERE NOT EXISTS (SELECT 1 FROM associations WHERE associations.subject_id = playback_snapshots.subject_id AND associations.connection_id = playback_snapshots.connection_id)'
      );
    } finally {
      this.running = false;
    }
  }
}
