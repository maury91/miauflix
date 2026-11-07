import type { PiecesUpdate } from '@miauflix/service-contracts';

import { logger } from '../lib/logger';
import type { BitfieldChange, StorageRepository } from './storage.repository';

interface Pieces {
  totalPieces: number;
  bitfield: Uint8Array;
}

/** The bitfield's bytes for `totalPieces` (stored bitfields may carry trailing bytes). */
const trim = ({ totalPieces, bitfield }: Pieces): Uint8Array => {
  const length = Math.ceil(totalPieces / 8);
  if (bitfield.length === length) return bitfield;
  const trimmed = new Uint8Array(length);
  trimmed.set(bitfield.subarray(0, length));
  return trimmed;
};

/** A bitfield as the contract sends it: base64 of the bytes `totalPieces` needs. */
export const encodeBitfield = (pieces: Pieces): string =>
  Buffer.from(trim(pieces)).toString('base64');

const base64Length = (bytes: number) => Math.ceil(bytes / 3) * 4;

/**
 * The message turning `previous` into `next`: the pieces verified since, when that is smaller
 * than the whole bitfield and no piece was lost; else the whole bitfield. Null when nothing was
 * added.
 */
export const piecesUpdate = (
  sourceId: number,
  previous: Pieces | undefined,
  next: Pieces
): PiecesUpdate | null => {
  const after = trim(next);
  const whole = (): PiecesUpdate => ({
    sourceId,
    totalPieces: next.totalPieces,
    bitfield: encodeBitfield({ totalPieces: next.totalPieces, bitfield: after }),
  });
  if (!previous || previous.totalPieces !== next.totalPieces) return whole();
  const before = trim(previous);
  const added: number[] = [];
  // JSON size of `added` ("[1,22,333]"), compared with the base64 bitfield.
  let addedLength = 2;
  const wholeLength = base64Length(after.length);
  for (let index = 0; index < after.length; index++) {
    const was = before[index] ?? 0;
    const now = after[index];
    if (was === now) continue;
    if (was & ~now) return whole();
    if (addedLength > wholeLength) continue;
    for (let bit = 0; bit < 8; bit++) {
      if (now & ~was & (0x80 >> bit)) {
        const piece = index * 8 + bit;
        added.push(piece);
        addedLength += String(piece).length + 1;
      }
    }
  }
  if (!added.length && addedLength === 2) return null;
  return addedLength <= wholeLength ? { sourceId, totalPieces: next.totalPieces, added } : whole();
};

/**
 * Pushes verified-piece changes to subscribers. Writes arrive per verified piece; each source's
 * changes are sent at most once per `flushMs`, as the difference from the last message.
 */
export class PieceUpdates {
  private readonly sent = new Map<number, Pieces>();
  private readonly pending = new Map<number, Pieces>();
  private readonly listeners = new Set<(update: PiecesUpdate) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribe: () => void;

  constructor(
    storage: StorageRepository,
    private readonly flushMs = 1_000
  ) {
    this.unsubscribe = storage.onBitfield(change => this.queue(change));
  }

  /** Hear every update; returns the unsubscribe function. */
  subscribe(listener: (update: PiecesUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private queue({ sourceId, totalPieces, bitfield }: BitfieldChange): void {
    // Copy: the caller may reuse the torrent's live buffer.
    this.pending.set(sourceId, { totalPieces, bitfield: new Uint8Array(bitfield) });
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.flushMs);
    this.timer.unref?.();
  }

  /** Send what is pending now. */
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const pending = [...this.pending];
    this.pending.clear();
    for (const [sourceId, next] of pending) {
      const update = piecesUpdate(sourceId, this.sent.get(sourceId), next);
      if (next.totalPieces) this.sent.set(sourceId, next);
      else this.sent.delete(sourceId);
      if (!update) continue;
      for (const listener of this.listeners) {
        try {
          listener(update);
        } catch (error) {
          logger.warn('PieceUpdates', 'Pieces listener failed', error);
        }
      }
    }
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
    this.unsubscribe();
  }
}
