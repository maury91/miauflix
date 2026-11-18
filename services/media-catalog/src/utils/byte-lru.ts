/**
 * A least-recently-used cache bounded by the bytes it holds: reading or writing an entry makes it
 * the most recent, and writing past the capacity drops the least recent entries until it fits. An
 * entry larger than the whole capacity is never kept.
 */
export class ByteLru<V extends { byteLength: number }> {
  /** Map order is recency: the first entry is the least recent. */
  private readonly entries = new Map<string, V>();
  private used = 0;

  constructor(private capacity: number) {}

  get bytes(): number {
    return this.used;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    this.delete(key);
    if (value.byteLength > this.capacity) return;
    this.entries.set(key, value);
    this.used += value.byteLength;
    this.trim();
  }

  delete(key: string): void {
    const previous = this.entries.get(key);
    if (previous === undefined) return;
    this.entries.delete(key);
    this.used -= previous.byteLength;
  }

  /** A new capacity; shrinking drops the least recent entries at once. */
  resize(capacity: number): void {
    this.capacity = capacity;
    this.trim();
  }

  private trim(): void {
    for (const [key, value] of this.entries) {
      if (this.used <= this.capacity) return;
      this.entries.delete(key);
      this.used -= value.byteLength;
    }
  }
}
