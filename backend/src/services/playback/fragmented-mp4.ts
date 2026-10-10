import { Transform, type TransformCallback } from 'node:stream';

interface Box {
  type: string;
  start: number;
  end: number;
  payload: number;
}

function boxes(data: Buffer, start = 0, end = data.length): Box[] {
  const result: Box[] = [];
  while (start < end) {
    if (start + 8 > end) throw new Error('Truncated MP4 box');
    const length = data.readUInt32BE(start);
    if (length < 8 || start + length > end) throw new Error('Invalid MP4 box');
    result.push({
      type: data.toString('ascii', start + 4, start + 8),
      start,
      end: start + length,
      payload: start + 8,
    });
    start += length;
  }
  return result;
}

function requiredBox(data: Buffer, parent: Box, type: string): Box {
  const box = boxes(data, parent.payload, parent.end).find(child => child.type === type);
  if (!box) throw new Error(`Missing MP4 ${type}`);
  return box;
}

function timeScale(data: Buffer, box: Box): number {
  const offset = data[box.payload] === 1 ? 20 : 12;
  if (box.payload + offset + 4 > box.end) throw new Error('Truncated MP4 timescale');
  const scale = data.readUInt32BE(box.payload + offset);
  if (!scale) throw new Error('Invalid MP4 timescale');
  return scale;
}

/**
 * FFmpeg's MP4 muxer expresses seek origins as edit lists and restarts tfdt at zero.
 * MSE ignores those edit lists. Restore each track's clock in tfdt, using one common
 * timestampOffset for negative initial decode times (H.264 B-frames/AAC encoder delay).
 * Only init/fragment metadata is buffered; arbitrarily large mdat payloads pass through.
 */
export class FragmentedMp4Timeline extends Transform {
  readonly initialized: Promise<number>;
  private resolveInit!: (offset: number) => void;
  private rejectInit!: (error: Error) => void;
  private pending: Buffer = Buffer.alloc(0);
  private payloadRemaining = 0;
  private readonly tracks = new Map<number, { scale: number; origin: number }>();
  private offset = 0;
  private hasInit = false;

  constructor() {
    super();
    this.initialized = new Promise((resolve, reject) => {
      this.resolveInit = resolve;
      this.rejectInit = reject;
    });
    // The owner may still be waiting for FFmpeg startup when a parsing error arrives.
    void this.initialized.catch(() => undefined);
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    try {
      let data = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
      this.pending = Buffer.alloc(0);
      while (data.length) {
        if (this.payloadRemaining) {
          const length = Math.min(data.length, this.payloadRemaining);
          this.push(data.subarray(0, length));
          data = data.subarray(length);
          this.payloadRemaining -= length;
          continue;
        }
        if (data.length < 8) {
          this.pending = data;
          break;
        }
        const size = data.readUInt32BE(0);
        const type = data.toString('ascii', 4, 8);
        if (size < 8) throw new Error('Invalid fragmented MP4 box');
        if (type === 'moov' || type === 'moof') {
          if (size > 2 * 1024 * 1024) throw new Error('MP4 metadata exceeds limit');
          if (data.length < size) {
            this.pending = data;
            break;
          }
          const metadata = Buffer.from(data.subarray(0, size));
          if (type === 'moov') this.readInit(metadata);
          else this.retime(metadata);
          this.push(metadata);
          data = data.subarray(size);
        } else {
          this.push(data.subarray(0, 8));
          data = data.subarray(8);
          this.payloadRemaining = size - 8;
        }
      }
      callback();
    } catch (error) {
      const failure = error as Error;
      this.rejectInit(failure);
      callback(failure);
    }
  }

  private readInit(data: Buffer): void {
    const moov = boxes(data)[0];
    const movieScale = timeScale(data, requiredBox(data, moov, 'mvhd'));
    for (const track of boxes(data, moov.payload, moov.end).filter(box => box.type === 'trak')) {
      const tkhd = requiredBox(data, track, 'tkhd');
      const idOffset = data[tkhd.payload] === 1 ? 20 : 12;
      const id = data.readUInt32BE(tkhd.payload + idOffset);
      const mdia = requiredBox(data, track, 'mdia');
      const scale = timeScale(data, requiredBox(data, mdia, 'mdhd'));
      const edts = boxes(data, track.payload, track.end).find(box => box.type === 'edts');
      let origin = 0;
      if (edts) {
        const elst = requiredBox(data, edts, 'elst');
        const version = data[elst.payload];
        const count = data.readUInt32BE(elst.payload + 4);
        let position = elst.payload + 8;
        if (version > 1 || count > 2) throw new Error('Unsupported MP4 edit list');
        for (let entry = 0; entry < count; entry++) {
          const size = version === 1 ? 20 : 12;
          if (position + size > elst.end) throw new Error('Truncated MP4 edit list');
          const duration =
            version === 1 ? Number(data.readBigUInt64BE(position)) : data.readUInt32BE(position);
          const mediaTime =
            version === 1
              ? Number(data.readBigInt64BE(position + 8))
              : data.readInt32BE(position + 4);
          if (mediaTime === -1) origin += duration / movieScale;
          else origin -= mediaTime / scale;
          position += size;
        }
        // The offset is now carried by tfdt; retaining edts would apply it twice
        // in consumers that do honor edit lists. A same-size free box keeps offsets intact.
        data.write('free', edts.start + 4, 'ascii');
      }
      this.tracks.set(id, { scale, origin });
    }
    if (!this.tracks.size) throw new Error('MP4 has no tracks');
    this.offset = Math.min(0, ...[...this.tracks.values()].map(track => track.origin));
    this.hasInit = true;
    this.resolveInit(this.offset);
  }

  private retime(data: Buffer): void {
    if (!this.hasInit) throw new Error('MP4 fragment arrived before initialization');
    const moof = boxes(data)[0];
    for (const traf of boxes(data, moof.payload, moof.end).filter(box => box.type === 'traf')) {
      const tfhd = requiredBox(data, traf, 'tfhd');
      const id = data.readUInt32BE(tfhd.payload + 4);
      const track = this.tracks.get(id);
      if (!track) throw new Error('Unknown MP4 track');
      const tfdt = requiredBox(data, traf, 'tfdt');
      const adjustment = BigInt(Math.round((track.origin - this.offset) * track.scale));
      if (data[tfdt.payload] !== 1 || tfdt.payload + 12 > tfdt.end) {
        throw new Error('Unsupported MP4 decode timestamp');
      }
      data.writeBigUInt64BE(data.readBigUInt64BE(tfdt.payload + 4) + adjustment, tfdt.payload + 4);
    }
  }

  override _flush(callback: TransformCallback) {
    if (!this.hasInit || this.pending.length || this.payloadRemaining) {
      const failure = new Error('Incomplete fragmented MP4 stream');
      this.rejectInit(failure);
      callback(failure);
    } else callback();
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    if (!this.hasInit) this.rejectInit(error ?? new Error('MP4 preparation cancelled'));
    callback(error);
  }
}
