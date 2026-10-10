import { afterEach, describe, expect, it, jest } from 'bun:test';

import { ArtworkAnalysisWorkerClient } from '../src/services/artwork-analysis.worker-client';

const originalWorker = globalThis.Worker;
class FakeWorker {
  static instances: FakeWorker[] = [];
  listeners = new Map<string, (event: { data?: unknown; message?: string }) => void>();
  messages: Array<{ id: number }> = [];
  terminated = false;
  constructor() {
    FakeWorker.instances.push(this);
  }
  addEventListener(type: string, listener: (event: { data?: unknown; message?: string }) => void) {
    this.listeners.set(type, listener);
  }
  postMessage(value: unknown) {
    this.messages.push(value as { id: number });
  }
  terminate() {
    this.terminated = true;
  }
  reply(value: unknown) {
    this.listeners.get('message')?.({ data: value });
  }
}
afterEach(() => {
  globalThis.Worker = originalWorker;
  jest.useRealTimers();
});
describe('artwork worker deadlines', () => {
  it('rejects every request on timeout, recreates the worker and ignores late old errors', async () => {
    jest.useFakeTimers();
    FakeWorker.instances = [];
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    const client = new ArtworkAnalysisWorkerClient();
    const first = client.prepare('first');
    const second = client.prepare('second');
    const failures = Promise.allSettled([first, second]);
    const old = FakeWorker.instances[0]!;
    jest.advanceTimersByTime(60_000);
    expect((await failures).map(result => result.status)).toEqual(['rejected', 'rejected']);
    await expect(first).rejects.toThrow('artwork_worker_timeout');
    expect(old.terminated).toBe(true);
    const next = client.prepare('next');
    const replacement = FakeWorker.instances[1]!;
    old.listeners.get('error')?.({ message: 'late error' });
    const result = { type: 'backdrop' as const, png: 'ok', luminance: 'luminance', pixelBytes: 1 };
    replacement.reply({ id: replacement.messages[0]!.id, ok: true, result });
    await expect(next).resolves.toEqual(result);
    jest.advanceTimersByTime(60_000);
    expect(replacement.terminated).toBe(false);
    await client.close();
  });
});
