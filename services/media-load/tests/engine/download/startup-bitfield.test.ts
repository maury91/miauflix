import { mockEngineModules } from '../../helpers/engine';

mockEngineModules();

const { startupBitfield } = await import('../../../src/engine/download/torrent-attacher');

/** Bencode, enough for a .torrent: strings, buffers, integers and dictionaries. */
const bencode = (value: unknown): Buffer => {
  if (typeof value === 'number') return Buffer.from(`i${value}e`);
  if (typeof value === 'string' || Buffer.isBuffer(value)) {
    const bytes = Buffer.from(value as string);
    return Buffer.concat([Buffer.from(`${bytes.length}:`), bytes]);
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : 1
  );
  return Buffer.concat([
    Buffer.from('d'),
    ...entries.flatMap(([key, item]) => [bencode(key), bencode(item)]),
    Buffer.from('e'),
  ]);
};

/** A real .torrent of one file in `pieces` pieces of 16 KiB. */
const torrentFile = (pieces: number) =>
  bencode({
    announce: 'udp://tracker.example:1337',
    info: {
      name: 'movie.mkv',
      length: pieces * 16384,
      'piece length': 16384,
      pieces: Buffer.alloc(pieces * 20, 1),
    },
  });

describe('startupBitfield', () => {
  const empty = { location: '/tmp/x', encryptedLayout: null, downloadedPieces: new Uint8Array(0) };

  it('starts an empty download from an all-zero bitfield of the right size', async () => {
    // 17 pieces: 3 bytes, so WebTorrent uses it instead of hashing every piece
    expect(await startupBitfield(torrentFile(17), { ...empty, verifiedBytes: 0 })).toEqual(
      new Uint8Array(3)
    );
  });

  it('keeps a recorded bitfield', async () => {
    const recorded = new Uint8Array([0b1000_0000]);
    expect(
      await startupBitfield(torrentFile(3), {
        ...empty,
        downloadedPieces: recorded,
        verifiedBytes: 1,
      })
    ).toBe(recorded);
  });

  it('lets WebTorrent verify when data may be stored or the pieces are unknown', async () => {
    // Verified data without a recorded bitfield: hashing finds it
    expect(await startupBitfield(torrentFile(3), { ...empty, verifiedBytes: 100 })).toBeUndefined();
    expect(await startupBitfield(torrentFile(3), empty)).toBeUndefined();
    // A magnet without its .torrent yet
    expect(await startupBitfield(undefined, { ...empty, verifiedBytes: 0 })).toBeUndefined();
  });
});
