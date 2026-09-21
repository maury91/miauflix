import {
  connectionResultSchema,
  listServiceDefinitionSchema,
  listServicePageSchema,
  LIST_CAPABILITY,
  LIST_CAPABILITY_VERSION,
  MANAGEMENT_PROTOCOL_VERSION,
  providerAssociationSchema,
  providerAuthorizationSchema,
  SERVICE_MANIFEST_PATH,
  serviceConfigApplyResultSchema,
  serviceConfigMutationSchema,
  serviceConfigSchemaSchema,
  serviceConfigStateSchema,
  serviceConfigTestResultSchema,
  serviceManifestSchema,
  serviceStatusSchema,
} from '@miauflix/service-contracts';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import { z } from 'zod';

import { mapItems, normalizeListItems, type TraktItem } from './list-normalization';
import { parsePositivePage } from './request-validation';
import { TraktClient } from './trakt-client';

const PORT = Number(process.env.LIST_SERVICE_PORT ?? 3002);
const HOST = process.env.LIST_SERVICE_HOST ?? '0.0.0.0';
const DEFAULT_API_URL = process.env.TRAKT_API_URL ?? 'https://api.trakt.tv';
const DATA_DIR = process.env.LIST_SERVICE_DATA_DIR ?? process.env.DATA_DIR ?? './data';
mkdirSync(DATA_DIR, { recursive: true });
const encryptionKey = (): Buffer => {
  const value = runtimeConfig.LIST_SERVICE_ENCRYPTION_KEY;
  if (!value) throw new Error('LIST_SERVICE_ENCRYPTION_KEY is required');
  return createHash('sha256').update(value).digest();
};

const database = new Database(`${DATA_DIR}/list-service.sqlite`);
database.run(`
  CREATE TABLE IF NOT EXISTS associations (
    subject_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL UNIQUE,
    username TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL
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

const seal = (value: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
};
const open = (value: string): string => {
  const [iv, tag, ciphertext] = value.split('.').map(part => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};

const schema = {
  name: 'List Service',
  description: 'Trakt-backed public and personal lists.',
  variables: [
    {
      key: 'TRAKT_API_URL',
      description: 'Trakt API URL',
      required: false,
      inputType: 'text',
      defaultValue: DEFAULT_API_URL,
      testRelevant: true,
    },
    {
      key: 'TRAKT_CLIENT_ID',
      description: 'Trakt client ID',
      required: true,
      secret: true,
      inputType: 'password',
      testRelevant: true,
    },
    {
      key: 'TRAKT_CLIENT_SECRET',
      description: 'Trakt client secret',
      required: true,
      secret: true,
      inputType: 'password',
      testRelevant: true,
    },
    {
      key: 'LIST_SERVICE_ENCRYPTION_KEY',
      description: 'Encryption key for provider credentials',
      required: true,
      secret: true,
      inputType: 'password',
    },
  ],
};

const runtimeConfig = {
  TRAKT_API_URL: DEFAULT_API_URL,
  TRAKT_CLIENT_ID: process.env.TRAKT_CLIENT_ID ?? '',
  TRAKT_CLIENT_SECRET: process.env.TRAKT_CLIENT_SECRET ?? '',
  LIST_SERVICE_ENCRYPTION_KEY: process.env.LIST_SERVICE_ENCRYPTION_KEY ?? '',
};
const config = {
  values: {
    ...runtimeConfig,
  },
  ready: false,
};

const defaultFor = (key: keyof typeof runtimeConfig): string =>
  key === 'TRAKT_API_URL' ? DEFAULT_API_URL : '';

const applyConfig = (values: Record<string, string>, unsetKeys: string[] = []) => {
  for (const key of unsetKeys) {
    if (!(key in runtimeConfig)) continue;
    const typedKey = key as keyof typeof runtimeConfig;
    config.values[typedKey] = defaultFor(typedKey);
    runtimeConfig[typedKey] = defaultFor(typedKey);
  }
  for (const [key, value] of Object.entries(values)) {
    if (value) {
      config.values[key as keyof typeof config.values] = value;
      runtimeConfig[key as keyof typeof runtimeConfig] = value;
    }
  }
  config.ready = !!(
    config.values.TRAKT_CLIENT_ID &&
    config.values.TRAKT_CLIENT_SECRET &&
    config.values.LIST_SERVICE_ENCRYPTION_KEY
  );
};
applyConfig({});

const client = () =>
  new TraktClient(
    config.values.TRAKT_CLIENT_ID,
    config.values.TRAKT_CLIENT_SECRET,
    config.values.TRAKT_API_URL
  );

const candidateConfig = (values: Record<string, string>, unsetKeys: string[]) => {
  const candidate = { ...config.values, ...values };
  for (const key of unsetKeys) {
    if (key in candidate)
      candidate[key as keyof typeof candidate] = defaultFor(key as keyof typeof runtimeConfig);
  }
  return candidate;
};

const probeConfig = async (candidate: typeof config.values) => {
  const hasRequiredValues = !!(
    candidate.TRAKT_CLIENT_ID &&
    candidate.TRAKT_CLIENT_SECRET &&
    candidate.LIST_SERVICE_ENCRYPTION_KEY
  );
  if (!hasRequiredValues) {
    return { success: false, message: 'Required Trakt configuration is missing' };
  }
  try {
    await new TraktClient(
      candidate.TRAKT_CLIENT_ID,
      candidate.TRAKT_CLIENT_SECRET,
      candidate.TRAKT_API_URL
    ).test();
    return {
      success: true,
      message:
        'Trakt API is reachable and the client ID is accepted; the client secret is verified during account authorization',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Trakt configuration test failed',
    };
  }
};

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
  } | null;

const accessToken = async (subjectId: string): Promise<string> => {
  const record = association(subjectId);
  if (!record) throw new Error('Trakt account is not connected');
  if (record.expires_at > Date.now() + 5 * 60 * 1000) return open(record.access_token);
  const refreshed = await client().refreshToken(open(record.refresh_token));
  database
    .query(
      'UPDATE associations SET access_token = ?1, refresh_token = ?2, expires_at = ?3 WHERE subject_id = ?4'
    )
    .run(
      seal(refreshed.access_token),
      seal(refreshed.refresh_token),
      Date.now() + refreshed.expires_in * 1000,
      subjectId
    );
  return refreshed.access_token;
};

const listPage = async (listId: string, subjectId: string | undefined, page: number) => {
  let path: string;
  let mediaType: 'movie' | 'tv' = listId.includes('shows') ? 'tv' : 'movie';
  let token: string | undefined;
  if (listId === 'trakt-movies-popular') path = '/movies/popular?limit=50';
  else if (listId === 'trakt-movies-trending') path = '/movies/trending?limit=50';
  else if (listId === 'trakt-shows-popular') path = '/shows/popular?limit=50';
  else if (listId === 'trakt-shows-trending') path = '/shows/trending?limit=50';
  else {
    if (!subjectId) throw new Error('subjectId is required');
    token = await accessToken(subjectId);
    if (listId === 'trakt-watchlist-movies') path = '/sync/watchlist/movies?limit=50';
    else if (listId === 'trakt-watchlist-shows') path = '/sync/watchlist/shows?limit=50';
    else if (listId === 'trakt-favorites-movies') path = '/users/me/favorites/movies?limit=50';
    else if (listId === 'trakt-favorites-shows') path = '/users/me/favorites/shows?limit=50';
    else if (listId === 'trakt-history-movies') path = '/sync/history/movies?limit=50';
    else if (listId === 'trakt-history-shows') path = '/sync/history/shows?limit=50';
    else throw new Error('List not found');
  }
  path = path.replace('limit=50', `page=${page}&limit=50`);
  const result = await client().page<TraktItem>(path, token);
  const bare = listId.endsWith('-popular');
  const items = mapItems(normalizeListItems(result.items, mediaType, bare), mediaType);
  return listServicePageSchema.parse({
    listId,
    page,
    totalPages: result.totalPages,
    totalItems: result.totalItems,
    items,
  });
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
            configurationStatePath: '/configuration',
            configurationTestPath: '/configuration/test',
            configurationApplyPath: '/configuration',
          },
        })
      );
    if (request.method === 'GET' && path === '/status')
      return json(
        serviceStatusSchema.parse({
          state: config.ready ? 'ready' : 'standby',
          missingConfiguration: config.ready
            ? undefined
            : ['TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET', 'LIST_SERVICE_ENCRYPTION_KEY'],
          details: {
            provider: 'trakt',
            connectedAccounts: Number(
              (
                database.query('SELECT COUNT(*) AS count FROM associations').get() as {
                  count?: number;
                } | null
              )?.count ?? 0
            ),
            cachedLists: 0,
          },
        })
      );
    if (request.method === 'GET' && path === '/configuration/schema')
      return json(serviceConfigSchemaSchema.parse(schema));
    if (request.method === 'GET' && path === '/configuration')
      return json(
        serviceConfigStateSchema.parse({
          configuredKeys: Object.entries(config.values)
            .filter(([, value]) => value)
            .map(([key]) => key),
        })
      );
    if (request.method === 'POST' && path === '/configuration/test') {
      const mutation = serviceConfigMutationSchema.parse(await request.json());
      const candidate = candidateConfig(mutation.values, mutation.unsetKeys);
      const test = await probeConfig(candidate);
      return json(
        serviceConfigTestResultSchema.parse({
          success: test.success,
          mode: 'live',
          message: test.message,
        }),
        test.success ? 200 : 400
      );
    }
    if (request.method === 'PUT' && path === '/configuration') {
      const mutation = serviceConfigMutationSchema.parse(await request.json());
      const candidate = candidateConfig(mutation.values, mutation.unsetKeys);
      const test = await probeConfig(candidate);
      if (!test.success) {
        return json(
          serviceConfigApplyResultSchema.parse({
            success: false,
            reloaded: false,
            test: { success: false, mode: 'live', message: test.message },
          }),
          400
        );
      }
      applyConfig(mutation.values, mutation.unsetKeys);
      return json(
        serviceConfigApplyResultSchema.parse({
          success: config.ready,
          reloaded: config.ready,
          test: {
            success: true,
            mode: 'live',
            message: test.message,
          },
        }),
        config.ready ? 200 : 400
      );
    }
    serviceReady();
    if (request.method === 'GET' && path === '/v1/lists')
      return json(definitions(url.searchParams.get('subjectId') ?? undefined));
    if (request.method === 'GET' && path.startsWith('/v1/lists/')) {
      const listId = decodeURIComponent(path.slice('/v1/lists/'.length));
      const page = parsePositivePage(url.searchParams.get('page'));
      if (page === null) return json({ error: 'page must be a positive safe integer' }, 400);
      return json(await listPage(listId, url.searchParams.get('subjectId') ?? undefined, page));
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
        database
          .query('DELETE FROM associations WHERE subject_id = ?1 OR account_id = ?2')
          .run(subjectId, profile.ids.slug);
        database
          .query('INSERT INTO associations VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
          .run(
            subjectId,
            profile.ids.slug,
            profile.username,
            seal(token.access_token),
            seal(token.refresh_token),
            Date.now() + token.expires_in * 1000
          );
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
        database.query('DELETE FROM associations WHERE subject_id = ?1').run(subjectId);
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
