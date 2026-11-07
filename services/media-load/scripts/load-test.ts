/**
 * Time to first byte of a playback read while other torrents download, through the real
 * contract (WebSocket calls, HTTP byte reads). It runs its own media-load in this process, with
 * fresh data and download directories, and connects as its only host. Run it in the media-load
 * container: `bun run scripts/load-test.ts [background-count]` (default 5; 0 is the baseline).
 *
 * The playback target is Debian's amd64 netinst image. The background torrents are the netinst
 * images of other architectures, predownloaded with prefetch claims (priority 2) as the
 * backend's background jobs do. All of them are public; the directories are deleted at the end.
 *
 * `LOAD_SOAK_MINUTES=n` then keeps everything downloading (and seeding) for n minutes, reading
 * 8 MB at a random offset of the playback file every minute and logging memory, open file
 * descriptors and progress, to spot leaks in a long run.
 */
import { randomBytes } from 'node:crypto';
import { setDefaultResultOrder } from 'node:dns';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { connect, createClient, management, serve } from '@miauflix/contract';
import { mediaLoad, type TargetRef } from '@miauflix/service-contracts';
import parseTorrent from 'parse-torrent';

import { MediaLoadConfigService } from '../src/config/config.service';
import { createMediaLoadService } from '../src/service';

setDefaultResultOrder('ipv4first');

const BACKGROUND = Number(process.argv[2] ?? 5);
const WARM_MS = Number(process.env.LOAD_WARM_MS ?? 20_000);
const READ_BYTES = 8 * 1024 * 1024;
const ARCHES = ['amd64', 'arm64', 'ppc64el', 's390x', 'riscv64', 'armhf'];

const work = mkdtempSync(join(tmpdir(), 'media-load-load-'));
const { service, stop } = createMediaLoadService({
  dataDir: join(work, 'data'),
  defaultDownloadPath: join(work, 'downloads'),
});
const server = await serve(service, { hostname: '127.0.0.1', port: 0 });
const connection = connect({
  url: `http://127.0.0.1:${server.port}`,
  ticketKey: randomBytes(32).toString('base64url'),
});
await connection.ready(10_000);
const client = createClient(mediaLoad, connection.transport);
const admin = createClient(management, connection.transport);

await client.attach({ securityKey: randomBytes(32).toString('base64') });
const applied = await admin.applyConfig({
  values: {
    ...new MediaLoadConfigService().defaults(),
    DOWNLOAD_PATH: join(work, 'downloads'),
    DOWNLOAD_SALT: randomBytes(16).toString('hex'),
  },
});
if (!applied.success) throw new Error(`Configuration refused: ${JSON.stringify(applied)}`);
await client.completeImport();

const netinst = async (arch: string) => {
  const base = `https://cdimage.debian.org/debian-cd/current/${arch}/bt-cd/`;
  const index = await (await fetch(base)).text();
  const name = index.match(
    new RegExp(`href="(debian-[\\d.]+-${arch}-netinst\\.iso\\.torrent)"`)
  )?.[1];
  if (!name) throw new Error(`No Debian ${arch} netinst torrent listed`);
  const file = Buffer.from(await (await fetch(base + name)).arrayBuffer());
  const parsed = await parseTorrent(file);
  return { arch, file, hash: parsed.infoHash as string, size: Number(parsed.length) };
};

const sources = await Promise.all(ARCHES.slice(0, BACKGROUND + 1).map(netinst));
const targets: TargetRef[] = [];
for (const [index, source] of sources.entries()) {
  const id = index + 1;
  await client.putSource({
    source: {
      id,
      hash: source.hash,
      magnetLink: `magnet:?xt=urn:btih:${source.hash}`,
      size: source.size,
      file: source.file.toString('base64'),
    },
  });
  const layout = await client.resolveLayout({ sourceId: id });
  targets.push({ sourceId: id, filePath: layout.files[0].path, matchKind: 'single' });
}
const [play, ...background] = targets;

// Verified-piece updates over the WebSocket: how many, and how many sent only the added pieces.
const pieceMessages = { added: 0, whole: 0, bytes: 0 };
client.piecesChanged.on(update => {
  if (update.added) pieceMessages.added++;
  else pieceMessages.whole++;
  pieceMessages.bytes += JSON.stringify(update).length;
});

const started = Date.now();
for (const target of background)
  await client.predownload({ target, claim: { kind: 'prefetch', ownerKey: 'load-test' } });
if (background.length) {
  console.log(
    `${background.length} background torrents predownloading; warming ${WARM_MS / 1000} s`
  );
  await new Promise(resolve => setTimeout(resolve, WARM_MS));
}

/** Read `READ_BYTES` from `start`: time to the response, to the first body byte, to the end. */
const timedRead = async (label: string, start: number, timeoutMs = 120_000) => {
  const t0 = performance.now();
  const signal = AbortSignal.timeout(timeoutMs);
  let stage = 'waiting for headers';
  let bytes = 0;
  try {
    const response = await client.read.open(
      { target: play },
      { headers: { Range: `bytes=${start}-${start + READ_BYTES - 1}` }, signal }
    );
    const headersAt = performance.now() - t0;
    stage = 'reading the body';
    const reader = response.body!.getReader();
    let firstAt = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!bytes) firstAt = performance.now() - t0;
      bytes += value.byteLength;
    }
    const total = performance.now() - t0;
    return `${label}: ${response.status}, headers ${headersAt.toFixed(0)} ms, first byte ${firstAt.toFixed(0)} ms, ${(bytes / 2 ** 20).toFixed(1)} MB in ${(total / 1000).toFixed(1)} s (${(bytes / 2 ** 20 / (total / 1000)).toFixed(1)} MB/s)`;
  } catch (error) {
    return `${label} at ${start}: FAILED ${stage} after ${((performance.now() - t0) / 1000).toFixed(1)} s, ${(bytes / 2 ** 20).toFixed(1)} MB read (${(error as Error).message})`;
  }
};

const size = sources[0].size;
const sourceIds = targets.map(target => target.sourceId);
const verified = async () =>
  new Map(
    (await client.storageStates({ sourceIds })).map(state => [state.sourceId, state.verifiedBytes])
  );
const before = await verified();
const readsStarted = Date.now();
const results = [
  await timedRead('start of file', 0),
  await timedRead('seek to 50%', Math.floor(size / 2)),
  await timedRead('seek to 80%', Math.floor(size * 0.8)),
];
const readSeconds = (Date.now() - readsStarted) / 1000;
const after = await verified();
const runtime = 'Bun' in globalThis ? `Bun ${Bun.version}` : `Node ${process.version}`;
console.log(
  `\nLoad test under ${runtime} (${process.platform}/${process.arch}), ${background.length} background torrents, ${((Date.now() - started) / 1000).toFixed(0)} s`
);
for (const line of results) console.log(`  ${line}`);
// What each torrent verified while the reads ran (the playback reads included).
for (const [index, sourceId] of sourceIds.entries()) {
  const mb = ((after.get(sourceId) ?? 0) - (before.get(sourceId) ?? 0)) / 2 ** 20;
  const label = index ? `background ${sources[index].arch}` : `playback ${sources[0].arch}`;
  console.log(
    `  ${label}: ${mb.toFixed(1)} MB during the reads (${(mb / readSeconds).toFixed(1)} MB/s)`
  );
}

const mbps = (bytesPerSecond: number) => (bytesPerSecond / 2 ** 20).toFixed(1);
for (const item of (await client.storageInventory()).items) {
  const t = item.transfer;
  if (t)
    console.log(
      `  source ${item.sourceId} transfer: ↓ ${mbps(t.downloadSpeed)} MB/s, ↑ ${mbps(t.uploadSpeed)} MB/s, ${t.peers} peers, totals ↓ ${(t.totalDownloaded / 2 ** 20).toFixed(0)} MB ↑ ${(t.totalUploaded / 2 ** 20).toFixed(0)} MB`
    );
}
const history = await client.transferHistory({ sourceId: play.sourceId });
console.log(
  `  playback history: ${history.length} samples, peak ↓ ${mbps(Math.max(0, ...history.map(sample => sample.downloadSpeed)))} MB/s`
);
const [bitfield] = await client.storageBitfields({ sourceIds: [play.sourceId] });
console.log(
  `  piece updates: ${pieceMessages.added} with added pieces, ${pieceMessages.whole} whole bitfields, ${(pieceMessages.bytes / 1024).toFixed(0)} KB in all; playback bitfield ${bitfield?.totalPieces} pieces, ${bitfield?.bitfield.length} base64 chars`
);

const SOAK_MINUTES = Number(process.env.LOAD_SOAK_MINUTES ?? 0);
if (SOAK_MINUTES > 0) {
  const openFds = () => {
    try {
      return readdirSync('/proc/self/fd').length;
    } catch {
      return -1;
    }
  };
  const mb = (bytes: number) => (bytes / 2 ** 20).toFixed(0);
  console.log(`\nSoak: ${SOAK_MINUTES} min; minute, rss MB, heap MB, fds, verified MB total, read`);
  for (let minute = 1; minute <= SOAK_MINUTES; minute++) {
    await new Promise(resolve => setTimeout(resolve, 60_000));
    let read: string;
    try {
      read = await timedRead('read', Math.floor(Math.random() * (size - READ_BYTES)));
    } catch (error) {
      read = `read failed: ${(error as Error).message}`;
    }
    Bun.gc(true);
    const memory = process.memoryUsage();
    const total = [...(await verified()).values()].reduce((sum, value) => sum + value, 0);
    console.log(
      `  ${minute}, ${mb(memory.rss)}, ${mb(memory.heapUsed)}, ${openFds()}, ${mb(total)}, ${read.replace(/^read: /, '')}`
    );
  }
}

connection.close();
await server.stop();
await stop();
rmSync(work, { recursive: true, force: true });
process.exit(0);
