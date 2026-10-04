import { mergeProgress } from './progress.merge';
import type { ProgressEntry } from './progress.types';

const entry = (updatedAt: string, state: ProgressEntry['state'] = 'paused'): ProgressEntry => ({
  playable: { kind: 'movie', mediaId: 123 },
  positionSeconds: 30,
  durationSeconds: 100,
  state,
  updatedAt,
});

describe('two-way playback progress merge', () => {
  it('imports remote movies and episodes without duplicate identities', () => {
    const local = entry('2026-10-04T10:00:00Z');
    const remote = entry('2026-10-04T11:00:00+00:00');
    const episode: ProgressEntry = {
      ...remote,
      playable: { kind: 'episode', showMediaId: 42, seasonNumber: 1, episodeNumber: 2 },
    };
    expect(mergeProgress([local], [remote, episode])).toEqual([remote, episode]);
  });

  it('preserves newer local completion and local progress on equal timestamps', () => {
    const remote = entry('2026-10-04T10:00:00Z');
    const completed = entry('2026-10-04T11:00:00Z', 'completed');
    expect(mergeProgress([completed], [remote])).toEqual([completed]);
    expect(mergeProgress([completed], [entry(completed.updatedAt)])).toEqual([completed]);
  });

  it('retains local progress when Trakt has no playback entries', () => {
    const local = entry('2026-10-04T10:00:00Z');
    expect(mergeProgress([local], [])).toEqual([local]);
  });
});
