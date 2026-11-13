import { PlaybackState } from '../../../src/engine/download/playback-state';
import { logger } from '../../../src/lib/logger';

describe('PlaybackState', () => {
  it('counts streams by source and file, and forgets a source with its last stream', () => {
    const playback = new PlaybackState();
    playback.openStream(1, 'a.mkv');
    playback.openStream(1, 'a.mkv');
    playback.openStream(2, 'b.mkv');

    expect(playback.streamCount).toBe(3);
    expect(playback.sourceStreamCount(1)).toBe(2);
    expect(playback.activeSourceIds()).toEqual([1, 2]);
    expect([...playback.activeFiles(1)!]).toEqual([['a.mkv', 2]]);

    playback.closeStream(1, 'a.mkv');
    playback.closeStream(1, 'a.mkv');

    expect(playback.isPlaybackActive(1)).toBe(false);
    expect(playback.activeFiles(1)).toBeUndefined();
    expect(playback.activeSourceIds()).toEqual([2]);
    expect(playback.hasActivePlayback()).toBe(true);
  });

  it('never counts below zero when a stream is closed twice', () => {
    const playback = new PlaybackState();
    playback.closeStream(1, 'a.mkv');
    expect(playback.streamCount).toBe(0);
    expect(playback.sourceStreamCount(1)).toBe(0);
  });

  it('keeps where a file is read only while it is streamed', () => {
    const playback = new PlaybackState();
    playback.openStream(1, 'a.mkv');
    playback.setReadFraction(1, 'a.mkv', 0.4);
    expect(playback.readFractionOf(1, 'a.mkv')).toBe(0.4);

    playback.closeStream(1, 'a.mkv');
    expect(playback.readFractionOf(1, 'a.mkv')).toBeUndefined();
  });

  it('reports the longest-waiting blocked read and the last delivery', () => {
    const playback = new PlaybackState();
    expect(playback.blockedSince(1)).toBeNull();
    expect(playback.lastDelivery(1)).toBeNull();

    const first = Symbol('first');
    playback.blockedReads(1).set(first, 200);
    playback.blockedReads(1).set(Symbol('second'), 100);
    expect(playback.blockedSince(1)).toBe(100);

    const now = jest.spyOn(Date, 'now').mockReturnValue(1_234);
    playback.markDelivered(1);
    now.mockRestore();
    expect(playback.lastDelivery(1)).toBe(1_234);
  });

  it('notifies every listener of the active sources, despite one that throws', () => {
    const playback = new PlaybackState();
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const heard: number[][] = [];
    playback.onPlaybackChange(() => {
      throw new Error('listener failed');
    });
    const unsubscribe = playback.onPlaybackChange(ids => heard.push(ids));

    playback.openStream(3, 'c.mkv');
    playback.notifyPlaybackChange();
    unsubscribe();
    playback.notifyPlaybackChange();

    expect(heard).toEqual([[3]]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
