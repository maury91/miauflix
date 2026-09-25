import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  connectionResultSchema,
  LIST_CAPABILITY,
  LIST_CAPABILITY_VERSION,
  listServiceDefinitionSchema,
  listServicePageSchema,
  MANAGEMENT_PROTOCOL_VERSION,
  providerAssociationSchema,
  providerAuthorizationSchema,
  SERVICE_MANIFEST_PATH,
  serviceConfigApplyResultSchema,
  serviceConfigMutationSchema,
  serviceConfigSchemaSchema,
  serviceConfigTestResultSchema,
  serviceManifestSchema,
  ServiceSecretCodec,
  serviceStatusSchema,
} from '@miauflix/service-contracts';
import { Database } from 'bun:sqlite';
import { z } from 'zod';

import { ListConfigService } from './config/config.service';
import { disconnectAssociation, replaceAssociation } from './association-store';
import { listPage } from './list-page-cache';
import { parsePositivePage } from './request-validation';
import { TraktClient } from './trakt-client';

const PORT = Number(process.env.LIST_SERVICE_PORT ?? 3002);
const HOST = process.env.LIST_SERVICE_HOST ?? '0.0.0.0';
const DATA_DIR = process.env.LIST_SERVICE_DATA_DIR ?? process.env.DATA_DIR ?? './data';
const KEY_FILE = process.env.LIST_SERVICE_KEY_FILE ?? join(DATA_DIR, '.list-service-key');
const configuredEncryptionKey = process.env.LIST_SERVICE_ENCRYPTION_KEY;
const encryptionKey = configuredEncryptionKey
  ? createHash('sha256').update(configuredEncryptionKey).digest()
  : createHash('sha256')
      .update(new ServiceSecretCodec({ filePath: KEY_FILE }).key)
      .digest();
mkdirSync(DATA_DIR, { recursive: true });

const decrypt = (value: string): string => {
  const [iv, tag, ciphertext] = value.split('.').map(part => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};

const database = new Database(`${DATA_DIR}/list-service.sqlite`);
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

const seal = (value: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
};
const open = (value: string): string => decrypt(value);

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
      return {
        success: true,
        message: lastProbeMessage,
      };
    } catch (error) {
      lastProbeMessage = error instanceof Error ? error.message : 'Trakt configuration test failed';
      return {
        success: false,
        message: lastProbeMessage,
      };
    }
  },
  activate: async () => ({ success: true, message: lastProbeMessage }),
});

const publicDefinitions = [
  ['trakt-movies-popular', 'Popular Movies', 'Popular movies from Trakt', 'movies/popular'],
  ['trakt-movies-trending', 'Trending Movies', 'Trending movies from Trakt', 'movies/trending'],
  ['trakt-shows-popular', 'Popular Shows', 'Popular shows from Trakt', 'shows/popular'],
  ['trakt-shows-trending', 'Trending Shows', 'Trending shows from Trakt', 'shows/trending'],
] as const;

const definitions = (subjectId?: string) => {
  const result = publicDefinitions.map(([id, name, description]) =>
    listServiceDefinitionSchema.parse({
      id,
      slug: id,
      name,
      description,
      provider: 'trakt',
      scope: 'public',
      requiresConnection: false,
    })
  );
  if (
    subjectId &&
    database.query('SELECT 1 FROM associations WHERE subject_id = ?1').get(subjectId)
  ) {
    for (const [id, name, description] of [
      ['trakt-watchlist-movies', 'Movie Watchlist', 'Your Trakt movie watchlist'],
      ['trakt-watchlist-shows', 'Show Watchlist', 'Your Trakt show watchlist'],
      ['trakt-favorites-movies', 'Favorite Movies', 'Your favorite Trakt movies'],
      ['trakt-favorites-shows', 'Favorite Shows', 'Your favorite Trakt shows'],
      ['trakt-history-movies', 'Movie History', 'Your recently watched Trakt movies'],
      ['trakt-history-shows', 'Show History', 'Your recently watched Trakt shows'],
    ] as const) {
      result.push(
        listServiceDefinitionSchema.parse({
          id,
          slug: id,
          name,
          description,
          provider: 'trakt',
          scope: 'personal',
          requiresConnection: true,
        })
      );
    }
  }
  return result;
};

const association = (subjectId: string) =>
  database.query('SELECT * FROM associations WHERE subject_id = ?1').get(subjectId) as {
    subject_id: string;
    account_id: string;
    username: string | null;
    access_token: string;
    refresh_token: string;
    expires_at: number;
    connection_id: string;
  } | null;

const accessToken = async (subjectId: string, connectionId: string): Promise<string> => {
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

const json = (body: unknown, status = 200) => Response.json(body, { status });
const serviceReady = () => {
  if (!config.ready) throw new Error('list_service_not_configured');
};

const handler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (request.method === 'GET' && path === '/health')
      return json({ status: 'ok', state: config.ready ? 'ready' : 'standby' });
    if (request.method === 'GET' && path === SERVICE_MANIFEST_PATH)
      return json(
        serviceManifestSchema.parse({
          id: 'list-service',
          name: 'List Service',
          description: 'Trakt-backed lists',
          version: '0.1.0',
          managementProtocolVersion: MANAGEMENT_PROTOCOL_VERSION,
          capabilities: {
            [LIST_CAPABILITY]: { version: LIST_CAPABILITY_VERSION, basePath: '/v1' },
          },
          management: {
            statusPath: '/status',
            configurationSchemaPath: '/configuration/schema',
            configurationTestPath: '/configuration/test',
            configurationApplyPath: '/configuration',
          },
        })
      );
    if (request.method === 'GET' && path === '/status')
      return json(
        serviceStatusSchema.parse({
          state: config.ready ? 'ready' : 'standby',
          missingConfiguration: config.ready ? undefined : config.missingVars(),
          details: {
            provider: 'trakt',
            connectedAccounts: Number(
              (
                database.query('SELECT COUNT(*) AS count FROM associations').get() as {
                  count?: number;
                } | null
              )?.count ?? 0
            ),
            cachedLists: Number(
              (
                database.query('SELECT COUNT(*) AS count FROM list_pages').get() as {
                  count?: number;
                } | null
              )?.count ?? 0
            ),
          },
        })
      );
    if (request.method === 'GET' && path === '/configuration/schema')
      return json(serviceConfigSchemaSchema.parse(config.schema));
    if (request.method === 'POST' && path === '/configuration/test') {
      const mutation = serviceConfigMutationSchema.parse(await request.json());
      if ('clear' in mutation) {
        return json(
          {
            success: false,
            mode: 'validation',
            message: 'A clear operation cannot be tested.',
            invalidKeys: [],
          },
          400
        );
      }
      const test = await config.test(mutation.values);
      return json(serviceConfigTestResultSchema.parse(test), test.success ? 200 : 400);
    }
    if (request.method === 'PUT' && path === '/configuration') {
      const mutation = serviceConfigMutationSchema.parse(await request.json());
      const result =
        'clear' in mutation
          ? await config.clearRemote()
          : await config.applyRemote(mutation.values);
      return json(serviceConfigApplyResultSchema.parse(result), result.success ? 200 : 400);
    }
    serviceReady();
    if (request.method === 'GET' && path === '/v1/lists')
      return json(definitions(url.searchParams.get('subjectId') ?? undefined));
    if (request.method === 'GET' && path.startsWith('/v1/lists/')) {
      const listId = decodeURIComponent(path.slice('/v1/lists/'.length));
      const page = parsePositivePage(url.searchParams.get('page'));
      if (page === null) return json({ error: 'page must be a positive safe integer' }, 400);
      return json(
        await listPage({
          database,
          listId,
          subjectId: url.searchParams.get('subjectId') ?? undefined,
          page,
          association,
          accessToken,
          fetchPage: (path, token) => client().page(path, token),
          seal,
          open,
        }).then(value => listServicePageSchema.parse(value))
      );
    }
    if (request.method === 'POST' && path === '/v1/connections/trakt/device') {
      const { subjectId } = z.object({ subjectId: z.string().min(1) }).parse(await request.json());
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
      return json(
        providerAuthorizationSchema.parse({
          authorizationId: id,
          verificationUrl: code.verification_url,
          userCode: code.user_code,
          expiresAt: new Date(expiresAt).toISOString(),
          interval: code.interval,
        })
      );
    }
    if (request.method === 'POST' && path.startsWith('/v1/connections/trakt/device/')) {
      const authorizationId = decodeURIComponent(
        path.slice('/v1/connections/trakt/device/'.length)
      );
      const { subjectId } = z.object({ subjectId: z.string().min(1) }).parse(await request.json());
      const pending = database
        .query('SELECT * FROM authorizations WHERE id = ?1 AND subject_id = ?2')
        .get(authorizationId, subjectId) as { device_code: string; expires_at: number } | null;
      if (!pending || pending.expires_at <= Date.now()) return json({ state: 'expired' });
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
        return json(
          connectionResultSchema.parse({
            state: 'connected',
            association: {
              connected: true,
              provider: 'trakt',
              accountId: profile.ids.slug,
              username: profile.username,
            },
          })
        );
      } catch (error) {
        if ((error as { status?: number }).status === 400)
          return json(connectionResultSchema.parse({ state: 'pending' }));
        throw error;
      }
    }
    if (path.startsWith('/v1/connections/trakt/')) {
      const subjectId = decodeURIComponent(path.slice('/v1/connections/trakt/'.length));
      if (request.method === 'GET') {
        const record = association(subjectId);
        return json(
          providerAssociationSchema.parse({
            connected: !!record,
            provider: 'trakt',
            accountId: record?.account_id ?? null,
            username: record?.username ?? null,
          })
        );
      }
      if (request.method === 'DELETE') {
        const record = association(subjectId);
        if (record)
          await client()
            .revoke(open(record.access_token))
            .catch(() => undefined);
        disconnectAssociation(database, subjectId);
        return json({ connected: false, provider: 'trakt', accountId: null, username: null });
      }
    }
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    if (error instanceof Error && error.message === 'list_service_not_configured')
      return json({ error: error.message }, 503);
    console.error(error);
    return json({ error: 'Internal server error' }, 500);
  }
};

const server = Bun.serve({ hostname: HOST, port: PORT, fetch: handler });
console.info(`List Service listening on http://${HOST}:${server.port}`);

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.info(`List Service received ${signal}, shutting down`);
  await server.stop();
  database.close();
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
