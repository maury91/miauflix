import type { PiecesUpdate } from '@miauflix/service-contracts';

/** Downloaded stretches of a file, as `[start, end)` in `RANGE_SCALE`ths of the file. */
export type DownloadedRanges = Array<[number, number]>;

/** Ranges are in thousandths of the file: finer than a seek bar's pixels on most screens. */
export const RANGE_SCALE = 1000;

/** A source's verified pieces, most significant bit first (BitTorrent's order). */
export interface SourcePieces {
  totalPieces: number;
  bitfield: Uint8Array;
}

const decode = (base64: string, totalPieces: number): Uint8Array => {
  const bitfield = new Uint8Array(Math.ceil(totalPieces / 8));
  bitfield.set(Buffer.from(base64, 'base64').subarray(0, bitfield.length));
  return bitfield;
};

/**
 * Apply a `piecesChanged` update. A whole bitfield replaces the pieces (it also reports lost
 * pieces and, with `totalPieces` 0, a removed storage); `added` sets bits.
 */
export const applyPiecesUpdate = (
  current: SourcePieces | undefined,
  update: Pick<PiecesUpdate, 'added' | 'bitfield' | 'totalPieces'>
): SourcePieces => {
  if (update.bitfield !== undefined)
    return {
      totalPieces: update.totalPieces,
      bitfield: decode(update.bitfield, update.totalPieces),
    };
  const next =
    current && current.totalPieces === update.totalPieces
      ? current
      : {
          totalPieces: update.totalPieces,
          bitfield: new Uint8Array(Math.ceil(update.totalPieces / 8)),
        };
  for (const piece of update.added ?? [])
    if (piece >= 0 && piece < next.totalPieces) next.bitfield[piece >> 3] |= 0x80 >> (piece & 7);
  return next;
};

/** Merge a snapshot into pieces already heard (the snapshot may be older than an update). */
export const mergeSnapshot = (
  current: SourcePieces | undefined,
  snapshot: { totalPieces: number; bitfield: string }
): SourcePieces => {
  const decoded = decode(snapshot.bitfield, snapshot.totalPieces);
  if (current && current.totalPieces === snapshot.totalPieces)
    for (let index = 0; index < decoded.length; index++) decoded[index] |= current.bitfield[index];
  return { totalPieces: snapshot.totalPieces, bitfield: decoded };
};

/**
 * Which parts of one file are downloaded, from its source's pieces: each verified piece's bytes
 * inside the file, scaled to `RANGE_SCALE` (rounded outwards) and merged when they touch.
 */
export const downloadedRanges = (
  pieces: SourcePieces,
  pieceLength: number,
  file: { offset: number; length: number }
): DownloadedRanges => {
  const ranges: DownloadedRanges = [];
  if (!pieceLength || file.length <= 0 || !pieces.totalPieces) return ranges;
  const fileEnd = file.offset + file.length;
  const first = Math.floor(file.offset / pieceLength);
  const last = Math.min(Math.floor((fileEnd - 1) / pieceLength), pieces.totalPieces - 1);
  for (let piece = first; piece <= last; piece++) {
    if (!(pieces.bitfield[piece >> 3] & (0x80 >> (piece & 7)))) continue;
    const start = Math.max(piece * pieceLength, file.offset) - file.offset;
    const end = Math.min((piece + 1) * pieceLength, fileEnd) - file.offset;
    const scaledStart = Math.floor((start / file.length) * RANGE_SCALE);
    const scaledEnd = Math.ceil((end / file.length) * RANGE_SCALE);
    const previous = ranges[ranges.length - 1];
    if (previous && scaledStart <= previous[1]) previous[1] = Math.max(previous[1], scaledEnd);
    else ranges.push([scaledStart, scaledEnd]);
  }
  return ranges;
};
