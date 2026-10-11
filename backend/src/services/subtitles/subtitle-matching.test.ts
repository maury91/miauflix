import { filenameSimilarity } from './subtitle-matching';

describe('subtitle filename similarity', () => {
  const video = 'Movie.Title.2026.1080p.WEB-DL.H264-GROUP.mkv';

  it('normalizes folders, containers, case and release punctuation', () => {
    expect(
      filenameSimilarity(video, ['subtitles/MOVIE title 2026 1080p web_dl h264 GROUP.srt'])
    ).toBe(100);
  });

  it('ranks matching release formats above a shared movie title', () => {
    const close = filenameSimilarity(video, ['Movie.Title.2026.1080p.WEB-DL.H264-OTHER']);
    const other = filenameSimilarity(video, ['Movie.Title.2026.2160p.BluRay.HEVC-OTHER']);
    expect(close).toBeGreaterThan(other!);
    expect(close).toBeLessThan(100);
  });

  it('uses the best evidence from the release and subtitle filename', () => {
    expect(filenameSimilarity(video, ['Movie Title', video.replace('.mkv', '.srt')])).toBe(100);
  });

  it('does not strip a dotted release-group suffix', () => {
    expect(filenameSimilarity('Movie.2026.GROUP.mkv', ['Movie.2026.OTHER'])).toBeLessThan(100);
  });

  it('does not invent a score without a selected filename', () => {
    expect(filenameSimilarity(undefined, ['Movie Title'])).toBeNull();
    expect(filenameSimilarity('---', ['Movie Title'])).toBeNull();
    expect(filenameSimilarity(video, [])).toBe(0);
  });
});
