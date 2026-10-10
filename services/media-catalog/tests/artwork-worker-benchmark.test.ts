import { afterEach, describe, expect, it } from 'bun:test';
import sharp from 'sharp';

type WorkerReply = {
  id: number;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
};

describe('artwork analysis worker benchmark', () => {
  let worker: Worker | undefined;

  afterEach(() => worker?.terminate());

  it('measures optimized backdrop and logo analysis in the Bun worker runtime', async () => {
    const backdrop = await sharp({
      create: {
        width: 640,
        height: 360,
        channels: 4,
        background: { r: 28, g: 36, b: 48, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const logo = await sharp({
      create: {
        width: 256,
        height: 117,
        channels: 4,
        background: { r: 245, g: 245, b: 245, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    worker = new Worker(new URL('../src/workers/artwork-analysis.worker.ts', import.meta.url));
    let nextId = 0;
    const pending = new Map<
      number,
      { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void }
    >();
    worker.addEventListener('message', event => {
      const reply = event.data as WorkerReply;
      const request = pending.get(reply.id);
      if (!request) return;
      pending.delete(reply.id);
      request.resolve(reply);
    });
    worker.addEventListener('error', event => {
      for (const request of pending.values()) request.reject(new Error(event.message));
      pending.clear();
    });
    const call = (payload: Record<string, unknown>) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, {
          resolve: reply =>
            reply.ok && reply.result
              ? resolve(reply.result)
              : reject(new Error(reply.error ?? 'Artwork benchmark worker failed')),
          reject,
        });
        worker!.postMessage({ id, ...payload });
      });

    const prepared = await call({ type: 'prepare-buffer', png: backdrop.toString('base64') });
    expect(prepared.type).toBe('backdrop');
    expect(prepared.pixelBytes).toBeLessThan(backdrop.byteLength);

    const durations: number[] = [];
    let eventLoopResponsive = false;
    const timer = new Promise<void>(resolve =>
      setTimeout(() => {
        eventLoopResponsive = true;
        resolve();
      }, 0)
    );
    const cpuStart = process.cpuUsage();
    const memoryStart = process.memoryUsage().rss;
    for (let index = 0; index < 25; index += 1) {
      const start = performance.now();
      const result = await call({
        type: 'measure',
        backdropPng: prepared.png,
        backdropLuminance: prepared.luminance,
        logoUrl: 'https://image.tmdb.org/t/p/w300/benchmark.png',
        decodedPng: logo.toString('base64'),
      });
      durations.push(performance.now() - start);
      expect(result.type).toBe('logo');
      expect((result.card as { passes: boolean }).passes).toBe(true);
      expect((result.hero as { passes: boolean }).passes).toBe(true);
    }
    await timer;
    const cpu = process.cpuUsage(cpuStart);
    const memoryDelta = process.memoryUsage().rss - memoryStart;
    const sorted = [...durations].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;

    console.info(
      `[artwork-worker-benchmark] runtime=Bun samples=${durations.length} ` +
        `median=${sorted[Math.floor(sorted.length / 2)]!.toFixed(2)}ms ` +
        `p95=${p95.toFixed(2)}ms processCpu=${((cpu.user + cpu.system) / 1000).toFixed(2)}ms ` +
        `rssDelta=${memoryDelta}B preparedStorage=${prepared.pixelBytes}B eventLoopResponsive=${eventLoopResponsive}`
    );
    expect(eventLoopResponsive).toBe(true);
    expect(p95).toBeLessThan(1000);
  });
});
