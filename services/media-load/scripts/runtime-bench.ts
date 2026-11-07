/**
 * Compares the torrent engine's cost under Bun and Node: throughput, CPU time and memory, with
 * the engine's encrypted chunk store. Runs under both runtimes:
 *
 *   bun run scripts/runtime-bench.ts
 *   node --import tsx scripts/runtime-bench.ts
 *
 * Phase 1 seeds a random file to a leecher in the same process over TCP (no swarm variance: it
 * measures hashing, encryption, the wire protocol and I/O). Phase 2 downloads Debian's amd64
 * netinst from the public swarm for `BENCH_SWARM_SECONDS` (default 60). uTP is off in both
 * runtimes unless `BENCH_UTP=1` (Node only; Bun panics in utp-native). Data is deleted at the end.
 */
import { randomBytes } from 'node:crypto';
import { setDefaultResultOrder } from 'node:dns';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import WebTorrent, { type Torrent } from 'webtorrent';

import EncryptedChunkStore from '../src/chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import { resolveDhtBootstrap } from '../src/engine/dht-bootstrap';

setDefaultResultOrder('ipv4first');
const runtime = 'Bun' in globalThis ? `Bun ${Bun.version}` : `Node ${process.version}`;
const utp = process.env.BENCH_UTP === '1' && !('Bun' in globalThis);
const LOCAL_MB = Number(process.env.BENCH_LOCAL_MB ?? 512);
const SWARM_SECONDS = Number(process.env.BENCH_SWARM_SECONDS ?? 60);
const dir = mkdtempSync(join(tmpdir(), 'runtime-bench-'));
const key = randomBytes(32);
const engineOptions = {
  maxConns: 100,
  connectionBudget: 200,
  downloadLimit: -1,
  uploadLimit: -1,
  utp,
};
const encrypted = (path: string) => ({
  path,
  store: EncryptedChunkStore,
  storeOpts: { encryptionKey: key, filenameSalt: `bench-${path}` },
});

const gc = () => {
  if ('Bun' in globalThis) Bun.gc(true);
  else (globalThis as { gc?: () => void }).gc?.();
};

/** Samples CPU and RSS every second while `run` lasts. */
const measure = async (label: string, run: () => Promise<number>) => {
  gc();
  const rssBefore = process.memoryUsage().rss;
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  let peakRss = rssBefore;
  const sampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 250);
  const bytes = await run();
  clearInterval(sampler);
  const seconds = (performance.now() - t0) / 1000;
  const cpu = process.cpuUsage(cpu0);
  const cpuSeconds = (cpu.user + cpu.system) / 1e6;
  const mb = bytes / 2 ** 20;
  gc();
  const line = [
    `${label}: ${mb.toFixed(0)} MB in ${seconds.toFixed(1)} s (${(mb / seconds).toFixed(1)} MB/s)`,
    `CPU ${cpuSeconds.toFixed(1)} s (${((cpuSeconds / seconds) * 100).toFixed(0)}% of a core, ${((cpuSeconds / mb) * 1024).toFixed(1)} s/GB)`,
    `RSS ${(rssBefore / 2 ** 20).toFixed(0)} → peak ${(peakRss / 2 ** 20).toFixed(0)} MB, ${(process.memoryUsage().rss / 2 ** 20).toFixed(0)} MB after`,
  ].join(', ');
  console.log(line);
  return line;
};

const destroy = (client: WebTorrent) =>
  new Promise<void>(resolve => client.destroy(() => resolve()));

/** Phase 1: a seeder and a leecher in this process, over TCP on loopback. */
const local = () =>
  measure(`local seed → leech ${LOCAL_MB} MB`, async () => {
    const seedDir = join(dir, 'seed');
    mkdirSync(seedDir, { recursive: true });
    const file = join(seedDir, 'payload.bin');
    const chunk = randomBytes(2 ** 20);
    writeFileSync(file, Buffer.concat(Array.from({ length: LOCAL_MB }, () => chunk)));
    const off = { dht: false, tracker: false, lsd: false, utPex: false } as const;
    const seeder = new WebTorrent({ ...engineOptions, ...off });
    const leecher = new WebTorrent({ ...engineOptions, ...off });
    try {
      const seeded = await new Promise<Torrent>(resolve =>
        seeder.seed(file, { announce: [] }, torrent => resolve(torrent))
      );
      await new Promise<void>(resolve =>
        (seeder as unknown as { listening: boolean }).listening
          ? resolve()
          : seeder.once('listening', resolve)
      );
      const port = (seeder.address() as { port: number }).port;
      const torrent = leecher.add(seeded.torrentFile, encrypted(join(dir, 'leech')));
      torrent.once('infoHash', () => torrent.addPeer(`127.0.0.1:${port}`));
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(() => reject(new Error('local transfer timed out')), 300_000);
        torrent.on('done', () => {
          clearTimeout(deadline);
          resolve();
        });
      });
      return torrent.received;
    } finally {
      await destroy(leecher);
      await destroy(seeder);
    }
  });

/** Phase 2: the public Debian netinst swarm, every discovery path on. */
const swarm = async () => {
  const base = 'https://cdimage.debian.org/debian-cd/current/amd64/bt-cd/';
  const index = await (await fetch(base)).text();
  const name = index.match(/href="(debian-[\d.]+-amd64-netinst\.iso\.torrent)"/)?.[1];
  if (!name) throw new Error('No Debian netinst torrent listed');
  const file = Buffer.from(await (await fetch(base + name)).arrayBuffer());
  const bootstrap = await resolveDhtBootstrap();
  return measure(`Debian swarm ${SWARM_SECONDS} s`, async () => {
    const client = new WebTorrent({ ...engineOptions, dht: { bootstrap } });
    try {
      const torrent = client.add(file, encrypted(join(dir, 'swarm')));
      await Promise.race([
        new Promise<void>(resolve => torrent.on('done', resolve)),
        new Promise(resolve => setTimeout(resolve, SWARM_SECONDS * 1000)),
      ]);
      console.log(`  peers at the end: ${torrent.numPeers}`);
      return torrent.received;
    } finally {
      await destroy(client);
    }
  });
};

const results = [await local(), await swarm()];
rmSync(dir, { recursive: true, force: true });
console.log(
  `\nRuntime bench under ${runtime} (${process.platform}/${process.arch}), uTP ${utp ? 'on' : 'off'}`
);
for (const line of results) console.log(`  ${line}`);
process.exit(0);
