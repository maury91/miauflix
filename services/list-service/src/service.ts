import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';

import { defineService, type Service } from '@miauflix/contract';
import {
  type ConnectionResult,
  lists,
  type ListServiceDefinition,
  type ListServiceDefinitionsPage,
  type ListStatusDetails,
  MAX_POPULAR_PAGE_SIZE,
  type ProviderAssociation,
  type ProviderAuthorization,
} from '@miauflix/contracts';
import { ServiceSecretCodec } from '@miauflix/service-configuration';
import { Database } from 'bun:sqlite';

import { ListConfigService } from './config/config.service';
import { disconnectAssociation, replaceAssociation } from './association-store';
import { listPage } from './list-page-cache';
import { PlaybackSync } from './playback-sync';
import { TraktClient } from './trakt-client';

const POPULAR_LIST_TTL_MS = 15 * 60 * 1000;

export interface ListServiceOptions {
  dataDir: string;
  keyFile: string;
  /** Overrides the key file as the source of the at-rest encryption key. */
  encryptionKey?: string;
}

const publicDefinitions = [
  ['trakt-movies-popular', 'Popular Movies', 'Popular movies from Trakt'],
  ['trakt-movies-trending', 'Trending Movies', 'Trending movies from Trakt'],
  ['trakt-shows-popular', 'Popular Shows', 'Popular shows from Trakt'],
  ['trakt-shows-trending', 'Trending Shows', 'Trending shows from Trakt'],
] as const;

const personalDefinitions = [
  ['trakt-watchlist-movies', 'Movie Watchlist', 'Your Trakt movie watchlist'],
  ['trakt-watchlist-shows', 'Show Watchlist', 'Your Trakt show watchlist'],
  ['trakt-favorites-movies', 'Favorite Movies', 'Your favorite Trakt movies'],
  ['trakt-favorites-shows', 'Favorite Shows', 'Your favorite Trakt shows'],
  ['trakt-history-movies', 'Movie History', 'Your recently watched Trakt movies'],
  ['trakt-history-shows', 'Show History', 'Your recently watched Trakt shows'],
] as const;

// Trakt serves a list by its numeric id alone; owner slugs can be null for private accounts.
const communitySlug = (listId: number) => `trakt-community-${listId}`;

const isPositiveSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

type AssociationRow = {
  subject_id: string;
  account_id: string;
  username: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  connection_id: string;
};

/**
 * Build the list service: Trakt-backed lists, account connections and playback sync, implementing
 * the `lists` contract. `stop` (also run when the service is stopped by its server) halts the
 * playback timer and closes the database.
 */
export const createListService = (
  options: ListServiceOptions
): { service: Service; stop: () => Promise<void> } => {
  const { dataDir, keyFile } = options;
  mkdirSync(dataDir, { recursive: true });
  const encryptionKey = createHash('sha256')
    .update(options.encryptionKey ?? new ServiceSecretCodec({ filePath: keyFile }).key)
    .digest();

  const seal = (value: string): string => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
  };
  const open = (value: string): string => {
    const [iv, tag, ciphertext] = value.split('.').map(part => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  };

  const database = new Database(`${dataDir}/list-service.sqlite`);
  database.run(`
    CREATE TABLE IF NOT EXISTS associations (
      subject_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL UNIQUE,
      username TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      connection_id TEXT NOT NULL DEFAULT ''
    )
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS authorizations (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      device_code TEXT NOT NULL,
      user_code TEXT NOT NULL,
      verification_url TEXT NOT NULL,
      interval_seconds INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);
  const associationColumns = database.query('PRAGMA table_info(associations)').all() as Array<{
    name: string;
  }>;
  if (!associationColumns.some(column => column.name === 'connection_id')) {
    database.run("ALTER TABLE associations ADD COLUMN connection_id TEXT NOT NULL DEFAULT ''");
  }
  for (const record of database
    .query("SELECT subject_id FROM associations WHERE connection_id = ''")
    .all() as Array<{ subject_id: string }>) {
    database
      .query('UPDATE associations SET connection_id = ?1 WHERE subject_id = ?2')
      .run(crypto.randomUUID(), record.subject_id);
  }
  database.run(`
    CREATE TABLE IF NOT EXISTS list_pages (
      subject_id TEXT NOT NULL,
      list_id TEXT NOT NULL,
      page INTEGER NOT NULL,
      payload TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (subject_id, list_id, page)
    )
  `);

  const config = new ListConfigService();

  const client = () =>
    new TraktClient(
      config.resolve('TRAKT_CLIENT_ID'),
      config.resolve('TRAKT_CLIENT_SECRET'),
      config.resolve('TRAKT_API_URL'),
      config.resolve('TRAKT_REDIRECT_URI')
    );

  let lastProbeMessage = 'Trakt configuration applied';

  config.registerProber({
    test: async values => {
      try {
        await new TraktClient(
          values.TRAKT_CLIENT_ID,
          values.TRAKT_CLIENT_SECRET,
          values.TRAKT_API_URL,
          values.TRAKT_REDIRECT_URI
        ).test();
        lastProbeMessage =
          'Trakt API is reachable and the client ID is accepted; the client secret is verified during account authorization';
        return { success: true, message: lastProbeMessage };
      } catch (error) {
        lastProbeMessage =
          error instanceof Error ? error.message : 'Trakt configuration test failed';
        return { success: false, message: lastProbeMessage };
      }
    },
    activate: async () => ({ success: true, message: lastProbeMessage }),
  });

  const association = (subjectId: string) =>
    database
      .query('SELECT * FROM associations WHERE subject_id = ?1')
      .get(subjectId) as AssociationRow | null;

  /**
   * Return the connection's token, refreshing and persisting encrypted credentials if expiry is
   * within five minutes. Reject if the user's connection changed; provider, database, and
   * encryption errors propagate.
   */
  const refreshAccessToken = async (subjectId: string, connectionId: string): Promise<string> => {
    const record = association(subjectId);
    if (!record || record.connection_id !== connectionId)
      throw new Error('Trakt account connection changed');
    if (record.expires_at > Date.now() + 5 * 60 * 1000) return open(record.access_token);
    const refreshed = await client().refreshToken(open(record.refresh_token));
    const update = database
      .query(
        'UPDATE associations SET access_token = ?1, refresh_token = ?2, expires_at = ?3 WHERE subject_id = ?4 AND connection_id = ?5'
      )
      .run(
        seal(refreshed.access_token),
        seal(refreshed.refresh_token),
        Date.now() + refreshed.expires_in * 1000,
        subjectId,
        connectionId
      );
    if (!update.changes || association(subjectId)?.connection_id !== connectionId)
      throw new Error('Trakt account connection changed');
    return refreshed.access_token;
  };

  // Refresh tokens are single-use: share one refresh across list reads and the worker.
  const tokenFlights = new Map<string, Promise<string>>();
  /** Share an in-flight token lookup/refresh per user and connection. */
  const accessToken = (subjectId: string, connectionId: string): Promise<string> => {
    const key = `${subjectId}:${connectionId}`;
    const existing = tokenFlights.get(key);
    if (existing) return existing;
    const flight = refreshAccessToken(subjectId, connectionId).finally(() =>
      tokenFlights.delete(key)
    );
    tokenFlights.set(key, flight);
    return flight;
  };

  const playbackSync = new PlaybackSync(database, client, association, accessToken, seal, open);

  const count = (table: 'associations' | 'list_pages'): number =>
    Number(
      (
        database.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
          count?: number;
        } | null
      )?.count ?? 0
    );

  const publicDefinition = ([
    id,
    name,
    description,
  ]: (typeof publicDefinitions)[number]): ListServiceDefinition => ({
    id,
    slug: id,
    name,
    description,
    provider: 'trakt',
    scope: 'public',
    requiresConnection: false,
  });

  const definitions = (subjectId?: string): ListServiceDefinition[] => {
    const result = publicDefinitions.map(publicDefinition);
    if (subjectId && association(subjectId)) {
      for (const [id, name, description] of personalDefinitions) {
        result.push({
          id,
          slug: id,
          name,
          description,
          provider: 'trakt',
          scope: 'personal',
          requiresConnection: true,
        });
      }
    }
    return result;
  };

  const service: Service = defineService({
    info: {
      id: 'list-service',
      name: 'List Service',
      description: 'Trakt-backed lists',
      version: '0.1.0',
    },
    configuration: config,
    status: () => {
      const details: ListStatusDetails = {
        provider: 'trakt',
        connectedAccounts: count('associations'),
        cachedLists: count('list_pages'),
      };
      return config.ready
        ? { state: 'ready', details: { ...details } }
        : {
            state: 'standby',
            missingConfiguration: config.missingVars(),
            details: { ...details },
          };
    },
    onError: (method, error) => console.error(`List Service ${method} failed:`, error),
    onStop: () => {
      clearInterval(playbackTimer);
      database.close();
    },
  }).implement(lists, {
    definitions: ({ subjectId }) => definitions(subjectId || undefined),

    popularDefinitions: async ({ page, limit }, ctx) => {
      if (!isPositiveSafeInteger(page)) return ctx.fail('bad_request', 'invalid pagination');
      if (!isPositiveSafeInteger(limit) || limit > MAX_POPULAR_PAGE_SIZE)
        return ctx.fail('bad_request', 'limit must be between 1 and 20');
      const cacheListId = `__popular_lists__:${limit}`;
      const cached = database
        .query(
          'SELECT payload, fetched_at FROM list_pages WHERE subject_id = ?1 AND list_id = ?2 AND page = ?3'
        )
        .get('', cacheListId, page) as { payload: string; fetched_at: number } | null;
      if (cached && cached.fetched_at + POPULAR_LIST_TTL_MS > Date.now())
        return JSON.parse(open(cached.payload)) as ListServiceDefinitionsPage;
      try {
        const popular = await client().popularLists(page, limit);
        const result: ListServiceDefinitionsPage = {
          results: popular.items.map((entry, index) => ({
            id: communitySlug(entry.list.ids.trakt),
            slug: communitySlug(entry.list.ids.trakt),
            name: entry.list.name || 'Untitled Trakt list',
            description: entry.list.description,
            provider: 'trakt',
            scope: 'public',
            requiresConnection: false,
            rank: (page - 1) * limit + index,
          })),
          page,
          pageSize: limit,
          totalPages: popular.totalPages,
          totalItems: popular.totalItems,
        };
        database
          .query(
            `INSERT INTO list_pages (subject_id, list_id, page, payload, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(subject_id, list_id, page) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
          )
          .run('', cacheListId, page, seal(JSON.stringify(result)), Date.now());
        service.notifyStatus();
        return result;
      } catch (error) {
        if (cached) {
          console.warn(`Serving stale popular list page ${page}:`, error);
          return JSON.parse(open(cached.payload)) as ListServiceDefinitionsPage;
        }
        throw error;
      }
    },

    page: async ({ listId, page, subjectId }, ctx) => {
      if (!isPositiveSafeInteger(page))
        return ctx.fail('bad_request', 'page must be a positive safe integer');
      try {
        const result = await listPage({
          database,
          listId,
          subjectId: subjectId || undefined,
          page,
          association,
          accessToken,
          fetchPage: (path, token) => client().page(path, token),
          seal,
          open,
        });
        service.notifyStatus();
        return result;
      } catch (error) {
        if (error instanceof Error && error.message === 'List not found')
          return ctx.fail('not_found', error.message);
        throw error;
      }
    },

    beginTraktConnection: async ({ subjectId }): Promise<ProviderAuthorization> => {
      const code = await client().deviceCode();
      const id = crypto.randomUUID();
      const expiresAt = Date.now() + code.expires_in * 1000;
      database
        .query('INSERT INTO authorizations VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
        .run(
          id,
          subjectId,
          seal(code.device_code),
          code.user_code,
          code.verification_url,
          code.interval,
          expiresAt
        );
      return {
        authorizationId: id,
        verificationUrl: code.verification_url,
        userCode: code.user_code,
        expiresAt: new Date(expiresAt).toISOString(),
        interval: code.interval,
      };
    },

    checkTraktConnection: async ({ subjectId, authorizationId }): Promise<ConnectionResult> => {
      const pending = database
        .query('SELECT * FROM authorizations WHERE id = ?1 AND subject_id = ?2')
        .get(authorizationId, subjectId) as { device_code: string; expires_at: number } | null;
      if (!pending || pending.expires_at <= Date.now()) return { state: 'expired' };
      try {
        const token = await client().deviceToken(open(pending.device_code));
        const profile = await client().profile(token.access_token);
        replaceAssociation(database, {
          subjectId,
          accountId: profile.ids.slug,
          username: profile.username,
          accessToken: seal(token.access_token),
          refreshToken: seal(token.refresh_token),
          expiresAt: Date.now() + token.expires_in * 1000,
          connectionId: crypto.randomUUID(),
        });
        database.query('DELETE FROM authorizations WHERE id = ?1').run(authorizationId);
        service.notifyStatus();
        return {
          state: 'connected',
          association: {
            connected: true,
            provider: 'trakt',
            accountId: profile.ids.slug,
            username: profile.username,
          },
        };
      } catch (error) {
        if ((error as { status?: number }).status === 400) return { state: 'pending' };
        throw error;
      }
    },

    traktAssociation: ({ subjectId }): ProviderAssociation => {
      const record = association(subjectId);
      return {
        connected: !!record,
        provider: 'trakt',
        accountId: record?.account_id ?? null,
        username: record?.username ?? null,
      };
    },

    disconnectTrakt: async ({ subjectId }) => {
      const record = association(subjectId);
      if (record)
        await client()
          .revoke(open(record.access_token))
          .catch(() => undefined);
      disconnectAssociation(database, subjectId);
      service.notifyStatus();
    },

    syncPlayback: ({ subjectId, progress }, ctx) => {
      if (progress.positionSeconds > progress.durationSeconds)
        return ctx.fail('bad_request', 'positionSeconds must not exceed durationSeconds');
      return playbackSync.write(subjectId, progress);
    },

    playback: ({ subjectId }) => playbackSync.read(subjectId),

    syncWatchlist: async ({ subjectId, mediaType, mediaId, operation }) => {
      const record = association(subjectId);
      if (!record) return false;
      const token = await accessToken(subjectId, record.connection_id);
      const media = { mediaType, tmdbId: mediaId };
      if (operation === 'add') await client().addToWatchlist(media, token);
      else await client().removeFromWatchlist(media, token);
      return true;
    },
  });

  const playbackTimer = setInterval(() => {
    if (config.ready)
      void playbackSync.tick().catch(() => console.warn('Trakt background playback sync failed'));
  }, 5_000);

  return { service, stop: () => service.stop() };
};
