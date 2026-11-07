export interface GetOptions {
  offset?: number;
  length?: number;
}

type Callback<T = void> = (err: Error | null, value?: T) => void;

export default abstract class AbstractChunkStore {
  public readonly chunkLength: number;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(chunkLength: number) {}

  public abstract put(index: number, buf: Buffer, cb?: Callback): void;

  public abstract get(index: number, cb?: Callback<Buffer>): void;
  public abstract get(index: number, opts?: GetOptions | null, cb?: Callback<Buffer>): void;

  public abstract close(cb?: Callback): void;

  public abstract destroy(cb?: Callback): void;
}
