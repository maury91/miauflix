/**
 * Checks WebTorrent under this runtime with the engine's options, one discovery path at a time:
 * UDP tracker, HTTP tracker, DHT, WebRTC + web seed, local TCP seeding, the fork's priority APIs
 * and uTP. Run inside the media-load container: `bun run scripts/webtorrent-probe.ts`.
 * It downloads a few MB of the Debian netinst image and Sintel (public), then deletes them.
 */
import { createHash, randomBytes } from 'node:crypto';
import { setDefaultResultOrder } from 'node:dns';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import parseTorrent from 'parse-torrent';
import WebTorrent, { type Torrent, type WebTorrentOptions } from 'webtorrent';

import { resolveDhtBootstrap } from '../src/engine/dht-bootstrap';

// What the service entry does; `PROBE_RAW_DNS=1` checks the runtime without it.
if (process.env.PROBE_RAW_DNS !== '1') setDefaultResultOrder('ipv4first');
const bootstrap = process.env.PROBE_RAW_DNS === '1' ? undefined : await resolveDhtBootstrap();
console.log(`DHT bootstrap: ${bootstrap?.join(' ') ?? 'library defaults'}`);

const ENGINE_OPTIONS: WebTorrentOptions = {
  maxConns: 100,
  connectionBudget: 200,
  downloadLimit: 20 * 1024 * 1024,
  uploadLimit: 20 * 1024 * 1024,
  ...('Bun' in globalThis ? { utp: false } : {}),
  ...(bootstrap ? { dht: { bootstrap } } : {}),
};
const PHASE_MS = Number(process.env.PROBE_PHASE_MS ?? 60_000);
const WANT_BYTES = 2 * 1024 * 1024;
const dir = mkdtempSync(join(tmpdir(), 'wt-probe-'));
const results: Array<{ phase: string; ok: boolean; detail: string }> = [];

const wireTypes = (torrent: Torrent) =>
  Object.entries(
    torrent.wires.reduce<Record<string, number>>((counts, wire) => {
      const type = (wire as unknown as { type: string }).type;
      counts[type] = (counts[type] ?? 0) + 1;
      return counts;
    }, {})
  )
    .map(([type, count]) => `${type}=${count}`)
    .join(' ') || 'none';

/** Add a torrent, wait for metadata and `WANT_BYTES` of verified data (or the deadline). */
const probe = async (
  phase: string,
  options: WebTorrentOptions,
  input: string | Buffer,
  torrentOptions: Record<string, unknown> = {},
  expectWire?: (types: string) => boolean
) => {
  const started = Date.now();
  const client = new WebTorrent({ ...ENGINE_OPTIONS, ...options });
  if (options.dht && process.env.PROBE_DHT_WARM !== '0')
    await new Promise<void>(resolve => {
      const dht = client.dht as unknown as NodeJS.EventEmitter & { ready?: boolean };
      if (!dht || dht.ready) return resolve();
      dht.once('ready', () => resolve());
      setTimeout(resolve, 20_000);
    });
  const sources = new Map<string, number>();
  let announces = 0;
  const warnings: string[] = [];
  try {
    const torrent = client.add(input, { path: join(dir, phase), ...torrentOptions });
    torrent.on('trackerAnnounce', () => announces++);
    torrent.on('dhtAnnounce', () => announces++);
    torrent.on('warning', (error: Error) => warnings.length < 3 && warnings.push(error.message));
    (torrent as unknown as { discovery?: NodeJS.EventEmitter }).discovery?.on?.(
      'peer',
      (_peer: unknown, source: string) => sources.set(source, (sources.get(source) ?? 0) + 1)
    );
    const outcome = await new Promise<string>(resolve => {
      const deadline = setTimeout(() => resolve('timeout'), PHASE_MS);
      const check = () => {
        if (torrent.ready && torrent.downloaded >= WANT_BYTES) {
          clearTimeout(deadline);
          resolve('data');
        }
      };
      torrent.on('ready', () => {
        // Only the first file's start, so a phase costs a few MB.
        torrent.files.forEach(file => file.deselect());
        torrent.select(0, Math.ceil((WANT_BYTES * 2) / torrent.pieceLength), 1);
      });
      torrent.on('download', check);
      torrent.on('error', (error: Error) => resolve(`error: ${error.message}`));
    });
    const types = wireTypes(torrent);
    const peers = [...sources].map(([source, count]) => `${source}:${count}`).join(' ') || 'none';
    const ok = outcome === 'data' && (expectWire ? expectWire(types) : true);
    results.push({
      phase,
      ok,
      detail:
        `${outcome} in ${((Date.now() - started) / 1000).toFixed(1)}s, metadata=${torrent.ready}, ` +
        `${(torrent.downloaded / 1048576).toFixed(1)} MB, verified pieces=${torrent.pieces.filter(p => p === null).length}, ` +
        `announces=${announces}, discovered ${peers}, wires ${types}` +
        (client.dht
          ? `, dht nodes=${(client.dht as unknown as { nodes: { count(): number } }).nodes.count()}`
          : '') +
        (warnings.length ? `, warnings: ${warnings.join(' | ')}` : ''),
    });
  } catch (error) {
    results.push({ phase, ok: false, detail: `threw: ${(error as Error).message}` });
  } finally {
    await new Promise<void>(resolve => client.destroy(() => resolve()));
  }
};

/** Seed random bytes from one client and fetch them over TCP from another, by address only. */
const localSeed = async () => {
  const started = Date.now();
  const seeder = new WebTorrent({ ...ENGINE_OPTIONS, dht: false, tracker: false, lsd: false });
  const leecher = new WebTorrent({ ...ENGINE_OPTIONS, dht: false, tracker: false, lsd: false });
  try {
    const data = randomBytes(8 * 1024 * 1024 + 123);
    const file = join(dir, 'seed.bin');
    writeFileSync(file, data);
    const seeded = await new Promise<Torrent>(resolve =>
      seeder.seed(file, { announce: [], private: false }, resolve)
    );
    await new Promise<void>(resolve =>
      (seeder as unknown as { listening: boolean }).listening
        ? resolve()
        : seeder.once('listening', resolve)
    );
    const port = (seeder.address() as { port: number }).port;
    const leech = leecher.add(seeded.torrentFile, { path: join(dir, 'leech') });
    leech.once('infoHash', () => leech.addPeer(`127.0.0.1:${port}`));
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('timeout')), PHASE_MS);
      leech.on('done', () => {
        clearTimeout(deadline);
        resolve();
      });
    });
    const received = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      leech.files[0]
        .createReadStream()
        .on('data', (chunk: Buffer) => chunks.push(chunk))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject);
    });
    const same =
      createHash('sha1').update(received).digest('hex') ===
      createHash('sha1').update(data).digest('hex');
    results.push({
      phase: 'local TCP seed -> leech',
      ok: same && seeded.uploaded > 0,
      detail: `${((Date.now() - started) / 1000).toFixed(1)}s, port ${port}, wires ${wireTypes(leech)}, identical=${same}, seeder uploaded ${(seeded.uploaded / 1048576).toFixed(1)} MB`,
    });
  } catch (error) {
    results.push({ phase: 'local TCP seed -> leech', ok: false, detail: (error as Error).message });
  } finally {
    await Promise.all(
      [seeder, leecher].map(client => new Promise<void>(resolve => client.destroy(() => resolve())))
    );
  }
};

/** Seed and fetch over WebRTC only, matched by a local WebSocket tracker. */
const localWebRtc = async () => {
  const started = Date.now();
  const { Server } = await import('bittorrent-tracker');
  const tracker = new Server({ udp: false, http: false, ws: true, stats: false });
  await new Promise<void>(resolve => tracker.listen(0, '127.0.0.1', () => resolve()));
  const announce = `ws://127.0.0.1:${(tracker.ws as unknown as { address(): { port: number } }).address().port}`;
  // No TCP: the clients may only meet through the tracker's WebRTC signalling.
  const rtcOnly = { ...ENGINE_OPTIONS, dht: false, lsd: false, utPex: false, torrentPort: 0 };
  const seeder = new WebTorrent(rtcOnly);
  const leecher = new WebTorrent(rtcOnly);
  try {
    const data = randomBytes(2 * 1024 * 1024 + 7);
    const file = join(dir, 'rtc.bin');
    writeFileSync(file, data);
    const seeded = await new Promise<Torrent>(resolve =>
      seeder.seed(file, { announce: [announce] }, resolve)
    );
    const leech = leecher.add(seeded.magnetURI, { path: join(dir, 'rtc-leech') });
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error(`timeout, wires ${wireTypes(leech)}`)),
        PHASE_MS
      );
      leech.on('done', () => {
        clearTimeout(deadline);
        resolve();
      });
    });
    const types = wireTypes(leech);
    results.push({
      phase: 'local WebRTC seed -> leech',
      ok: /webrtc/.test(types) && !/tcp/.test(types),
      detail: `${((Date.now() - started) / 1000).toFixed(1)}s, wires ${types}, seeder uploaded ${(seeded.uploaded / 1048576).toFixed(1)} MB`,
    });
  } catch (error) {
    results.push({
      phase: 'local WebRTC seed -> leech',
      ok: false,
      detail: (error as Error).message,
    });
  } finally {
    await Promise.all(
      [seeder, leecher].map(client => new Promise<void>(resolve => client.destroy(() => resolve())))
    );
    await new Promise<void>(resolve => tracker.close(() => resolve()));
  }
};

const forkApis = () => {
  const client = new WebTorrent({ ...ENGINE_OPTIONS, dht: false, tracker: false, lsd: false });
  const torrent = client.add('magnet:?xt=urn:btih:' + 'a'.repeat(40), { path: join(dir, 'apis') });
  const missing = ['setPriority', 'throttleDownloadSpeed', 'throttleUploadSpeed'].filter(
    name => typeof (torrent as unknown as Record<string, unknown>)[name] !== 'function'
  );
  const budget = (client as unknown as { connectionBudget: number }).connectionBudget;
  results.push({
    phase: 'fork APIs',
    ok: !missing.length && budget === 200,
    detail: `connectionBudget=${budget}, missing=${missing.join(',') || 'none'}, utp=${(client as unknown as { utp: boolean }).utp}, UTP_SUPPORT=${(WebTorrent as unknown as { UTP_SUPPORT: boolean }).UTP_SUPPORT}`,
  });
  client.destroy();
};

const debianTorrent = async (): Promise<Buffer> => {
  const base = 'https://cdimage.debian.org/debian-cd/current/amd64/bt-cd/';
  const index = await (await fetch(base)).text();
  const name = index.match(/href="(debian-[\d.]+-amd64-netinst\.iso\.torrent)"/)?.[1];
  if (!name) throw new Error('No Debian netinst torrent listed');
  return Buffer.from(await (await fetch(base + name)).arrayBuffer());
};

const SINTEL =
  'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel' +
  '&tr=wss%3A%2F%2Ftracker.webtorrent.dev&tr=wss%3A%2F%2Ftracker.openwebtorrent.com' +
  '&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F';

forkApis();
const debian = await debianTorrent();
const parsed = await parseTorrent(debian);
const hash = parsed.infoHash;
console.log(`Debian ${parsed.name} ${hash}, its trackers: ${parsed.announce.join(' ')}`);
const none = { dht: false, tracker: false, lsd: false, utPex: false } as const;

await probe(
  'UDP tracker only',
  { ...none, tracker: true },
  `magnet:?xt=urn:btih:${hash}&tr=${encodeURIComponent('udp://tracker.opentrackr.org:1337/announce')}&tr=${encodeURIComponent('udp://open.stealth.si:80/announce')}`
);
await probe('HTTP tracker only', { ...none, tracker: true }, debian);
await probe(
  'DHT only (UDP), bootstrapped first',
  { ...none, dht: ENGINE_OPTIONS.dht ?? true },
  `magnet:?xt=urn:btih:${hash}`
);
await probe('WebRTC (public Sintel swarm)', { ...none, tracker: true }, SINTEL, {}, types =>
  /webrtc/.test(types)
);
await localSeed();
await localWebRtc();
await probe(
  'engine defaults (all discovery)',
  {},
  `magnet:?xt=urn:btih:${hash}&tr=${encodeURIComponent('udp://tracker.opentrackr.org:1337/announce')}`
);

rmSync(dir, { recursive: true, force: true });
console.log(
  `\nWebTorrent probe under ${'Bun' in globalThis ? `Bun ${Bun.version}` : `Node ${process.version}`} (${process.platform}/${process.arch})`
);
for (const { phase, ok, detail } of results)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${phase}: ${detail}`);
process.exit(results.every(result => result.ok) ? 0 : 1);
