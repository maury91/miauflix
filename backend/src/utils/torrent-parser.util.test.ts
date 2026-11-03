import { parseSourceMetadataInfo } from './torrent-parser.util';

describe('language separators', () => {
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
