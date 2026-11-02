import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient, localTransport, management } from '@miauflix/contract';
import { sources } from '@miauflix/service-contracts';
import { afterEach, expect, it } from 'bun:test';

import { createSourcesService } from '../src/service';
import { createSeal } from '../src/util/seal';
import { fixtureFetch, fixtureResolver } from './http-fixture';
const dirs: string[] = [];
const stops: Array<() => Promise<void>> = [];
const hash = 'a'.repeat(40),
  file = Buffer.from('d4:infod4:name4:testee');
const setup = async (handler: (url: URL) => Response) => {
  const dir = mkdtempSync(join(tmpdir(), 'sources-file-'));
  dirs.push(dir);
  const created = createSourcesService({
    dataDir: dir,
    resolveHost: fixtureResolver,
    keyFile: join(dir, '.key'),
    encryptionKey: 'test',
    fetch: fixtureFetch(url => handler(url)),
  });
  stops.push(created.stop);
  const transport = localTransport(created.service);
  await createClient(management, transport).applyConfig({
    values: { SOURCES_DISABLE_VPN_CHECK: 'true' },
  });
  return { client: createClient(sources, transport), codec: createSeal(join(dir, '.key'), 'test') };
};
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
it('resolves opaque provider references before public caches and shares identical work', async () => {
  const calls: string[] = [];
  const { client, codec } = await setup(url => {
    calls.push(url.host);
    return new Response(file);
  });
  const fileRef = codec.seal(
    JSON.stringify({ provider: 'yts', url: 'https://provider.invalid/source' })
  );
  const results = await Promise.all([
    client.torrentFile({ hash, fileRef }),
    client.torrentFile({ hash, fileRef }),
  ]);
  expect(results).toEqual([file.toString('base64'), file.toString('base64')]);
  expect(calls).toEqual(['provider.invalid']);
});
it('ignores legacy raw URLs and invalid references, using the bounded cache path', async () => {
  const calls: string[] = [];
  const { client } = await setup(url => {
    calls.push(url.href);
    return new Response(file);
  });
  expect(await client.torrentFile({ hash, fileRef: 'https://legacy.invalid/file' })).toBe(
    file.toString('base64')
  );
  expect(calls[0]).toBe(`https://itorrents.org/torrent/${hash.toUpperCase()}.torrent`);
});
it('falls through invalid cache bytes and decodes the torrage TTL exchange', async () => {
  const calls: string[] = [];
  const { client } = await setup(url => {
    calls.push(url.pathname);
    if (url.host === 'itorrents.org') return new Response('not bencode');
    if (url.pathname === '/torrent.php') return new Response('getTTL("onm")');
    expect(url.searchParams.get('ttl')).toBe('abc');
    return new Response(file);
  });
  expect(await client.torrentFile({ hash })).toBe(file.toString('base64'));
  expect(calls).toEqual([
    `/torrent/${hash.toUpperCase()}.torrent`,
    '/torrent.php',
    '/download.php',
  ]);
});
it('returns null for exhausted fallbacks and rejects invalid hashes without HTTP', async () => {
  const calls: string[] = [];
  const { client } = await setup(url => {
    calls.push(url.host);
    return new Response('bad', { status: 404 });
  });
  expect(await client.torrentFile({ hash })).toBeNull();
  const before = calls.length;
  await expect(client.torrentFile({ hash: 'invalid' })).rejects.toMatchObject({
    code: 'bad_request',
  });
  expect(calls.length).toBe(before);
});
