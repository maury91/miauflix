import { Readable } from 'node:stream';

import { FragmentedMp4Timeline } from './fragmented-mp4';

function box(type: string, ...parts: Buffer[]) {
  const payload = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8);
  header.write(type, 4);
  return Buffer.concat([header, payload]);
}

function clock(type: string, scale: number) {
  const payload = Buffer.alloc(24);
  payload.writeUInt32BE(scale, 12);
  return box(type, payload);
}

function track(id: number, scale: number, leadingMs: number, mediaTime: number) {
  const tkhd = Buffer.alloc(24);
  tkhd.writeUInt32BE(id, 12);
  const edit = Buffer.alloc(32);
  edit.writeUInt32BE(2, 4);
  edit.writeUInt32BE(leadingMs, 8);
  edit.writeInt32BE(-1, 12);
  edit.writeInt32BE(mediaTime, 24);
  return box(
    'trak',
    box('tkhd', tkhd),
    box('edts', box('elst', edit)),
    box('mdia', clock('mdhd', scale))
  );
}

function fragment(id: number) {
  const tfhd = Buffer.alloc(8);
  tfhd.writeUInt32BE(id, 4);
  const tfdt = Buffer.alloc(12);
  tfdt[0] = 1;
  return box('traf', box('tfhd', tfhd), box('tfdt', tfdt));
}

const setupTest = (start = 8005) => ({
  input: Buffer.concat([
    box('ftyp', Buffer.from('isom0000')),
    box(
      'moov',
      clock('mvhd', 1000),
      track(1, 16000, start, 1280),
      track(2, 48000, start ? 7914 : 0, 0)
    ),
    box('moof', fragment(1), fragment(2)),
    box('mdat', Buffer.alloc(128 * 1024, 7)),
  ]),
  timeline: new FragmentedMp4Timeline(),
});

async function transform(input: Buffer, timeline: FragmentedMp4Timeline, chunkSize: number) {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < input.length; offset += chunkSize)
    chunks.push(input.subarray(offset, offset + chunkSize));
  const source = Readable.from(chunks);
  source.pipe(timeline);
  const output: Buffer[] = [];
  for await (const chunk of timeline) output.push(chunk);
  return Buffer.concat(output);
}

describe('fragmented MP4 movie timeline', () => {
  it.each([1, 7, 1024, 256 * 1024])(
    'restores both track clocks across %i-byte boundaries',
    async chunkSize => {
      const { input, timeline } = setupTest();
      const output = await transform(input, timeline, chunkSize);
      expect(await timeline.initialized).toBe(0);
      let position = output.indexOf('tfdt');
      expect(output.readBigUInt64BE(position + 8)).toBe(126800n); // (8.005 - 0.080) * 16000
      position = output.indexOf('tfdt', position + 4);
      expect(output.readBigUInt64BE(position + 8)).toBe(379872n); // 7.914 * 48000
      expect(output.indexOf('edts')).toBe(-1);
      expect(output.subarray(output.indexOf('mdat') + 4)).toEqual(Buffer.alloc(128 * 1024, 7));
    }
  );

  it('uses a common negative offset at the beginning without unsigned timestamp underflow', async () => {
    const { input, timeline } = setupTest(0);
    const output = await transform(input, timeline, 512);
    expect(await timeline.initialized).toBe(-0.08);
    const first = output.indexOf('tfdt');
    expect(output.readBigUInt64BE(first + 8)).toBe(0n);
    const second = output.indexOf('tfdt', first + 4);
    expect(output.readBigUInt64BE(second + 8)).toBe(3840n);
  });

  it('rejects oversized or truncated metadata', async () => {
    const tooLarge = Buffer.alloc(8);
    tooLarge.writeUInt32BE(3 * 1024 * 1024);
    tooLarge.write('moov', 4);
    await expect(transform(tooLarge, new FragmentedMp4Timeline(), 8)).rejects.toThrow(
      'exceeds limit'
    );
    await expect(transform(Buffer.from([0, 0, 0]), new FragmentedMp4Timeline(), 1)).rejects.toThrow(
      'Incomplete'
    );
  });
});
