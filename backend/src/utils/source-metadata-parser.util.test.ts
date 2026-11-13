import { parseSourceMetadataInfo } from '@utils/source-metadata-parser.util';

describe('language separators', () => {
  it.each(['Movie_multi_audio_1080p', 'Movie_dual_audio_1080p'])(
    'recognizes markers surrounded by underscores in %s',
    (title: string) => {
      expect(parseSourceMetadataInfo(title).languages).toEqual(['multiple']);
    }
  );

  it.each(['Movie_premultiaudio_1080p', 'Movie_dualaudioextra_1080p'])(
    'rejects markers embedded in words in %s',
    (title: string) => {
      expect(parseSourceMetadataInfo(title).languages).not.toContain('multiple');
    }
  );

  it.each(['.', '-', '_', ' '])('accepts the literal separator %s', separator => {
    expect(parseSourceMetadataInfo(`Movie multi${separator}audio`).languages).toContain('multiple');
    expect(parseSourceMetadataInfo(`Movie dual${separator}audio`).languages).toContain('multiple');
  });

  it.each(['A', '0', 'Z'])('rejects accidental range member %s', separator => {
    expect(parseSourceMetadataInfo(`Movie multi${separator}audio`).languages).not.toContain(
      'multiple'
    );
    expect(parseSourceMetadataInfo(`Movie dual${separator}audio`).languages).not.toContain(
      'multiple'
    );
  });
});
