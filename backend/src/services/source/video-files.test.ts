import { containsPlayableVideo, isVideoFile, mainVideoPath } from './video-files';

describe('video file helpers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('recognizes video extensions regardless of case', () => {
    expect(isVideoFile('Movie.MKV')).toBe(true);
    expect(isVideoFile('Show/Show.S01E01.Mp4')).toBe(true);
    expect(isVideoFile('Movie.en.srt')).toBe(false);
    expect(isVideoFile('mkv.txt')).toBe(false);
  });

  it('picks the largest video even when its extension is uppercase', () => {
    expect(
      mainVideoPath([
        { path: 'Movie/Sample.mkv', length: 10 },
        { path: 'Movie/Movie.2020.MKV', length: 900 },
        { path: 'Movie/Movie.2020.en.srt', length: 2 },
      ])
    ).toBe('Movie/Movie.2020.MKV');
    expect(mainVideoPath([{ path: 'readme.txt', length: 1 }])).toBeNull();
  });
});

describe('containsPlayableVideo', () => {
  it('rejects a lone executable named like a release', () => {
    expect(containsPlayableVideo([{ path: 'Clayface (2026) 1080p WEB-DL.exe', length: 1e9 }])).toBe(
      false
    );
  });

  it('rejects a small video sample beside an archive', () => {
    expect(
      containsPlayableVideo([
        { path: 'Movie/Sample.mkv', length: 20e6 },
        { path: 'Movie/Movie.rar', length: 1.4e9 },
      ])
    ).toBe(false);
  });

  it('accepts a movie with extras and an episode pack', () => {
    expect(
      containsPlayableVideo([
        { path: 'Movie/Movie.mkv', length: 2e9 },
        { path: 'Movie/Movie.en.srt', length: 1e5 },
      ])
    ).toBe(true);
    expect(
      containsPlayableVideo(
        Array.from({ length: 24 }, (_, index) => ({
          path: `Show/Show.S01E${String(index + 1).padStart(2, '0')}.mkv`,
          length: 150e6,
        }))
      )
    ).toBe(true);
  });
});
