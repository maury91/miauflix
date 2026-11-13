import { resumeRangeStart } from '../../../src/engine/download/claim-requests';
import { claimInput } from '../../../src/engine/download/claim-selection';
import { READAHEAD_PRIORITY, RESUME_HEADER_BYTES } from '../../../src/engine/download/constants';
import { ReadaheadWindow, streamHeaders } from '../../../src/engine/download/file-streamer';
import type { StreamSelectingTorrent } from '../../../src/engine/download/types';
import type { AnyMock } from '../../helpers/engine';

const MiB = 1024 * 1024;

describe('streamHeaders', () => {
  it('answers a range with 206 and its byte span', () => {
    const { status, headers } = streamHeaders(
      { name: 'movie.mkv', length: 100 },
      { start: 10, end: 19 }
    );
    expect(status).toBe(206);
    expect(headers['Content-Range']).toBe('bytes 10-19/100');
    expect(headers['Content-Length']).toBe('10');
    expect(headers['Accept-Ranges']).toBe('bytes');
  });

  it('answers a whole file with 200 and its length', () => {
    const { status, headers } = streamHeaders({ name: 'movie.mkv', length: 100 }, null);
    expect(status).toBe(200);
    expect(headers['Content-Length']).toBe('100');
    expect(headers['Content-Range']).toBeUndefined();
  });
});

describe('ReadaheadWindow', () => {
  const torrent = () =>
    ({ destroyed: false, _select: jest.fn(), _deselect: jest.fn() }) as {
      destroyed: boolean;
      _select: AnyMock;
      _deselect: AnyMock;
    };

  it('moves one stream selection with the reader, within the file', () => {
    const selecting = torrent();
    const window = new ReadaheadWindow(selecting as unknown as StreamSelectingTorrent, 4, 10);

    window.move(2);
    window.move(2);
    window.move(8);
    window.clear();

    expect(selecting._select.mock.calls).toEqual([
      [2, 5, READAHEAD_PRIORITY, undefined, true],
      [8, 10, READAHEAD_PRIORITY, undefined, true],
    ]);
    expect(selecting._deselect.mock.calls).toEqual([
      [2, 5, true],
      [8, 10, true],
    ]);
  });

  it('selects nothing for an inspection read or a destroyed torrent', () => {
    const selecting = torrent();
    new ReadaheadWindow(selecting as unknown as StreamSelectingTorrent, 0, 10).move(1);
    selecting.destroyed = true;
    new ReadaheadWindow(selecting as unknown as StreamSelectingTorrent, 4, 10).move(1);
    new ReadaheadWindow(null, 4, 10).move(1);
    expect(selecting._select).not.toHaveBeenCalled();
  });
});

describe('resumeRangeStart', () => {
  it('starts a resume window early, within the file', () => {
    const length = 1_000 * MiB;
    expect(resumeRangeStart(length, 50 * MiB, 0.5)).toBe(500 * MiB - 16 * MiB);
    // Near the end the window still fits in the file.
    expect(resumeRangeStart(length, 50 * MiB, 1)).toBe(length - 50 * MiB);
  });

  it('warms the prefix when the position is near the start or unusable', () => {
    expect(resumeRangeStart(1_000 * MiB, 50 * MiB, 0.01)).toBe(0);
    expect(resumeRangeStart(1_000 * MiB, 50 * MiB, 0)).toBe(0);
    expect(resumeRangeStart(1_000 * MiB, 50 * MiB, Number.NaN)).toBe(0);
    expect(resumeRangeStart(RESUME_HEADER_BYTES * 2, MiB, 0.5)).toBe(0);
  });
});

describe('claimInput', () => {
  it('resolves the range and turns the lifetime into an expiry', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    expect(claimInput({ kind: 'warmup', ownerKey: 'lease' })).toEqual({
      kind: 'warmup',
      ownerKey: 'lease',
      rangeStart: 0,
      rangeEnd: null,
      expiresAt: new Date(1_000 + 10 * 60_000),
    });
    expect(claimInput({ kind: 'warmup', ownerKey: 'lease', ttlMs: null }).expiresAt).toBeNull();
    expect(claimInput({ kind: 'watched', ownerKey: 'user' }).expiresAt).toBeNull();
    expect(
      claimInput({ kind: 'playback', ownerKey: 's', rangeStart: 5, rangeEnd: 9, ttlMs: 1 })
    ).toMatchObject({ rangeStart: 5, rangeEnd: 9, expiresAt: new Date(1_001) });
    now.mockRestore();
  });
});
