import type { PiecesUpdate, StorageBitfield } from '@miauflix/service-contracts';

import type { ContentSource } from '@entities/content-source.entity';

import { PlaybackPiecesService, type PlaybackPiecesUpdate } from './playback-pieces.service';
import type { LivePlayback } from './playback-session.service';

const LAYOUT = {
  storeName: 'store',
  filenameSalt: 'salt',
  pieceLength: 100,
  files: [
    { path: 'sample.mkv', length: 100, offset: 0 },
    { path: 'movie.mkv', length: 900, offset: 100 },
  ],
};

const flush = () => new Promise(resolve => setImmediate(resolve));

const setupTest = (snapshots: StorageBitfield[] = []) => {
  const playbacks: LivePlayback[] = [];
  let piecesListener: ((update: PiecesUpdate) => void) | undefined;
  let resync: (() => void) | undefined;
  const mediaLoad = {
    onPieces: jest.fn((listener: (update: PiecesUpdate) => void, onResync: () => void) => {
      piecesListener = listener;
      resync = onResync;
      return () => undefined;
    }),
    getStorageBitfields: jest.fn(async (sourceIds: number[]) =>
      snapshots.filter(snapshot => sourceIds.includes(snapshot.sourceId))
    ),
    resolveLayout: jest.fn(async () => LAYOUT),
  };
  const sources = {
    findById: jest.fn(async (id: number) => ({ id }) as ContentSource),
  };
  const service = new PlaybackPiecesService({ livePlaybacks: () => playbacks }, mediaLoad, sources);
  const sent: PlaybackPiecesUpdate[] = [];
  service.onRanges(update => sent.push(update));
  /** Two ticks: the first starts the snapshot and layout lookups, the second uses them. */
  const settle = async () => {
    service.tick();
    await flush();
    await flush();
    service.tick();
  };
  return {
    service,
    playbacks,
    mediaLoad,
    sent,
    settle,
    pieces: (update: PiecesUpdate) => piecesListener!(update),
    resync: () => resync!(),
  };
};

const PLAYBACK: LivePlayback = {
  playbackId: 'p1',
  userId: 'u1',
  sessionId: 's1',
  sourceId: 7,
  filePath: 'movie.mkv',
};

describe('PlaybackPiecesService', () => {
  afterEach(() => jest.clearAllMocks());

  it('sends the played file’s ranges from the snapshot, then only when they change', async () => {
    // Pieces 1-3 cover the first third of movie.mkv.
    const { service, playbacks, sent, settle, pieces } = setupTest([
      { sourceId: 7, totalPieces: 10, bitfield: Buffer.from([0b01110000, 0]).toString('base64') },
    ]);
    playbacks.push(PLAYBACK);
    await settle();
    expect(sent).toEqual([{ userId: 'u1', sessionId: 's1', playbackId: 'p1', ranges: [[0, 334]] }]);

    service.tick();
    expect(sent).toHaveLength(1);

    pieces({ sourceId: 7, totalPieces: 10, added: [9] });
    service.tick();
    expect(sent[1].ranges).toEqual([
      [0, 334],
      [888, 1000],
    ]);
    expect(service.latestFor('u1', 's1')).toEqual([sent[1]]);
    expect(service.latestFor('u1', 'other')).toEqual([]);
    service.close();
  });

  it('uses the largest file while the played file is unknown', async () => {
    const { service, playbacks, sent, settle } = setupTest([
      { sourceId: 7, totalPieces: 10, bitfield: Buffer.from([0xff, 0xc0]).toString('base64') },
    ]);
    playbacks.push({ ...PLAYBACK, filePath: undefined });
    await settle();
    expect(sent[0].ranges).toEqual([[0, 1000]]);
    service.close();
  });

  it('asks for snapshots again after a resync and forgets ended playbacks', async () => {
    const { service, playbacks, mediaLoad, sent, settle, resync } = setupTest([
      { sourceId: 7, totalPieces: 10, bitfield: Buffer.from([0, 0]).toString('base64') },
    ]);
    playbacks.push(PLAYBACK);
    await settle();
    expect(mediaLoad.getStorageBitfields).toHaveBeenCalledTimes(1);
    resync();
    service.tick();
    expect(mediaLoad.getStorageBitfields).toHaveBeenCalledTimes(2);

    playbacks.splice(0);
    service.tick();
    expect(service.latestFor('u1', 's1')).toEqual([]);
    expect(sent).toHaveLength(1);
    service.close();
  });

  it('sends nothing when media-load cannot report pieces', async () => {
    const { service, playbacks, mediaLoad, sent, settle } = setupTest();
    mediaLoad.getStorageBitfields.mockRejectedValue(new Error('unsupported'));
    playbacks.push(PLAYBACK);
    await settle();
    expect(sent).toEqual([]);
    service.close();
  });
});
