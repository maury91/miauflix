type WorkerReply = {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
};

export class ArtworkAnalysisWorkerClient {
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: never) => void; reject: (error: Error) => void }
  >();

  prepare(
    url: string
  ): Promise<{ type: 'backdrop'; png: string; luminance: string; pixelBytes: number }> {
    return this.call({ type: 'prepare', url });
  }

  measure(input: {
    backdropPng: string;
    backdropLuminance: string;
    logoUrl: string;
    decodedPng?: string;
  }): Promise<{
    type: 'logo';
    width: number;
    height: number;
    decodedPng: string;
    card: { coverage: number; median: number; passes: boolean };
    hero: { coverage: number; median: number; passes: boolean };
  }> {
    return this.call({ type: 'measure', ...input });
  }

  async close(): Promise<void> {
    this.worker?.terminate();
    this.worker = null;
    for (const request of this.pending.values())
      request.reject(new Error('artwork_worker_stopped'));
    this.pending.clear();
  }

  private call<T>(request: object): Promise<T> {
    const worker = this.ensureWorker();
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: never) => void,
        reject,
      });
      worker.postMessage({ ...request, id });
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('../workers/artwork-analysis.worker.ts', import.meta.url));
    worker.addEventListener('message', event => {
      const reply = event.data as WorkerReply;
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      this.pending.delete(reply.id);
      if (reply.ok) pending.resolve(reply.result as never);
      else pending.reject(new Error(reply.error ?? 'artwork_analysis_failed'));
    });
    worker.addEventListener('error', event => {
      const error = new Error(event.message || 'artwork_worker_failed');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.worker = null;
      worker.terminate();
    });
    worker.addEventListener('messageerror', () => {
      const error = new Error('artwork_worker_message_invalid');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.worker = null;
      worker.terminate();
    });
    this.worker = worker;
    return worker;
  }
}
