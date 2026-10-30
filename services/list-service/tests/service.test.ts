import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient, isContractError, localTransport, management } from '@miauflix/contract';
import { lists } from '@miauflix/service-contracts';
import { afterEach, describe, expect, it } from 'bun:test';

import { createListService } from '../src/service';

const dirs: string[] = [];
const stops: Array<() => Promise<void>> = [];

const setup = () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'list-service-'));
  dirs.push(dataDir);
  const { service, stop } = createListService({
    dataDir,
    keyFile: join(dataDir, '.key'),
    encryptionKey: 'test-key',
  });
  stops.push(stop);
  const transport = localTransport(service);
  return {
    service,
    client: createClient(lists, transport),
    admin: createClient(management, transport),
  };
};

const values = {
  TRAKT_API_URL: 'https://trakt.invalid',
  TRAKT_CLIENT_ID: 'client-id',
  TRAKT_CLIENT_SECRET: 'client-secret',
  TRAKT_REDIRECT_URI: 'https://miauflix.example/callback',
};

const makeReady = async (admin: ReturnType<typeof setup>['admin']) => {
  const realFetch = globalThis.fetch;
  // The prober pings Trakt; answer locally so no real network call is made.
  globalThis.fetch = (async () => Response.json([])) as unknown as typeof fetch;
  try {
    return await admin.applyConfig({ values });
  } finally {
    globalThis.fetch = realFetch;
  }
};

afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('list service', () => {
  it('serves /health and reports standby until configured', async () => {
    const { service } = setup();
    const response = await service.fetch(new Request('http://x/health'));
    expect(await response.json()).toEqual({ status: 'ok', state: 'standby' });
  });

  it('rejects data-plane calls with not_configured before config is applied', async () => {
    const { client, admin } = setup();
    const error = await client.definitions({}).catch((e: unknown) => e);
    expect(isContractError(error, 'not_configured')).toBe(true);
    const status = await admin.status();
    expect(status.state).toBe('standby');
    expect(status.missingConfiguration?.length).toBeGreaterThan(0);
  });

  it('lists public definitions without a subject once configured', async () => {
    const { client, admin, service } = setup();
    const result = await makeReady(admin);
    expect(result.success).toBe(true);
    const definitions = await client.definitions({});
    expect(definitions.map(definition => definition.id)).toContain('trakt-movies-popular');
    expect(definitions.every(definition => definition.scope === 'public')).toBe(true);
    expect((await service.fetch(new Request('http://x/health')).then(r => r.json())).state).toBe(
      'ready'
    );
  });

  it('rejects invalid popular pagination with bad_request', async () => {
    const { client, admin } = setup();
    await makeReady(admin);
    for (const input of [
      { page: 0, limit: 10 },
      { page: 1.5, limit: 10 },
      { page: 1, limit: 0 },
      { page: 1, limit: 21 },
    ]) {
      const error = await client.popularDefinitions(input).catch((e: unknown) => e);
      expect(isContractError(error, 'bad_request')).toBe(true);
    }
  });

  it('rejects progress beyond the duration and invalid list pages', async () => {
    const { client, admin } = setup();
    await makeReady(admin);
    const progressError = await client
      .syncPlayback({
        subjectId: 'user',
        progress: {
          playable: { kind: 'movie', mediaId: 1 },
          positionSeconds: 11,
          durationSeconds: 10,
          state: 'playing',
        },
      })
      .catch((e: unknown) => e);
    expect(isContractError(progressError, 'bad_request')).toBe(true);
    const pageError = await client
      .page({ listId: 'trakt-movies-popular', page: 0 })
      .catch((e: unknown) => e);
    expect(isContractError(pageError, 'bad_request')).toBe(true);
  });

  it('returns false from syncWatchlist without an association', async () => {
    const { client, admin } = setup();
    await makeReady(admin);
    expect(
      await client.syncWatchlist({
        subjectId: 'nobody',
        mediaType: 'movie',
        mediaId: 1,
        operation: 'add',
      })
    ).toBe(false);
    expect(await client.traktAssociation({ subjectId: 'nobody' })).toEqual({
      connected: false,
      provider: 'trakt',
      accountId: null,
      username: null,
    });
    expect(await client.playback({ subjectId: 'nobody' })).toEqual([]);
  });
});
