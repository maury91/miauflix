import { matchChosenFile } from './episode-file-matcher';

describe('matchChosenFile', () => {
  it('takes a video naming no episode as the episode itself', () => {
    expect(matchChosenFile('Pack/Video 2.mkv', 1, 8, false)).toEqual({
      videoFilePath: 'Pack/Video 2.mkv',
      matchKind: 'single',
    });
  });

  it('takes a video naming that episode alone as single', () => {
    expect(matchChosenFile('Show.S01E08.mkv', 1, 8, false)?.matchKind).toBe('single');
  });

  it('uses a video holding several episodes only when combined files are allowed', () => {
    expect(matchChosenFile('Show.S01E08E09.mkv', 1, 8, false)).toBeNull();
    expect(matchChosenFile('Show.S01E08-09.mkv', 1, 8, true)).toEqual({
      videoFilePath: 'Show.S01E08-09.mkv',
      matchKind: 'combined',
    });
  });

  it('refuses a video naming other episodes, and files that are not videos', () => {
    expect(matchChosenFile('Show.S01E05.mkv', 1, 8, true)).toBeNull();
    expect(matchChosenFile('Pack/notes.txt', 1, 8, true)).toBeNull();
  });
});
