import type { ContentSource } from '@entities/content-source.entity';
import type { EncryptedStorageLayout } from '@entities/storage.entity';
import type { PlaybackTarget } from '@services/playback/playback-target';

import { matchingSubtitleFiles, TorrentSubtitlesService } from './torrent-subtitles.service';

const VIDEO = 'Show.S01E02.mkv';
const file = (path: string, length = 100) => ({ path, length, offset: 0 });
const layout = (paths: string[]): EncryptedStorageLayout => ({
  storeName: 'fixture',
  filenameSalt: 'salt',
  pieceLength: 1024,
  files: paths.map(path => file(path)),
});
const target = (filePath = VIDEO): PlaybackTarget => ({
  source: { id: 7 } as ContentSource,
  filePath,
  matchKind: 'single',
});

describe('torrent subtitle matching', () => {
  it('includes exact video sidecars and language/SDH variants but excludes other episodes and executables', () => {
    const matches = matchingSubtitleFiles(
      layout([
        'Show.S01E01.mkv',
        'Show.S01E02.mkv',
        'Show.S01E01.en.srt',
        'Show.S01E02.en.srt',
        'Show.S01E02.fr.sdh.ass',
        'Show.S01E02.srt',
        'en.srt',
        'Show.S01E02.en.exe',
        'Unrelated.en.srt',
      ]),
      VIDEO
    );
    expect(matches.map(item => item.path)).toEqual([
      'Show.S01E02.en.srt',
      'Show.S01E02.fr.sdh.ass',
      'Show.S01E02.srt',
    ]);
    expect(matches[1]).toMatchObject({ language: 'fr', hearingImpaired: true });
  });

  it('accepts generic language files only for a single video or a folder named after the selected video', () => {
    expect(
      matchingSubtitleFiles(layout(['Show.S01E02.mkv', 'Subs/en.srt', 'Subs/fr.forced.vtt']), VIDEO)
    ).toHaveLength(2);
    expect(
      matchingSubtitleFiles(
        layout([
          'Show.S01E01.mkv',
          'Show.S01E02.mkv',
          'Subs/Show.S01E02/en.srt',
          'Subs/Show.S01E01/en.srt',
        ]),
        VIDEO
      ).map(item => item.path)
    ).toEqual(['Subs/Show.S01E02/en.srt']);
  });

  it('recognizes full language names, ISO-3 codes, and regional tags without matching arbitrary filenames', () => {
    const matches = matchingSubtitleFiles(
      layout([
        'Show.S01E02.mkv',
        'Show.S01E02.English.srt',
        'Show.S01E02.fra.ass',
        'Show.S01E02.pt-BR.vtt',
        'Foo.srt',
      ]),
      VIDEO
    );
    expect(matches.map(track => track.language)).toEqual(['en', 'fr', 'pt']);
  });

  it('rejects oversized subtitle files', () => {
    const media = layout(['Show.S01E02.mkv', 'Show.S01E02.en.srt']);
    media.files[1].length = 3 * 1024 * 1024;
    expect(matchingSubtitleFiles(media, VIDEO)).toEqual([]);
  });

  it('keeps matching torrent files available when embedded inspection fails', async () => {
    const service = new TorrentSubtitlesService({
      prepareSubtitleFiles: async () => {},
      getMediaFiles: async () => layout(['Show.S01E02.mkv', 'Show.S01E02.en.srt']),
    } as never);
    const runner = service as unknown as { run: () => Promise<string> };
    jest.spyOn(runner, 'run').mockRejectedValue(new Error('Missing FFmpeg'));
    expect(await service.discover(target())).toMatchObject([
      { provider: 'torrent', fileId: '7:Show.S01E02.mkv:torrent:Show.S01E02.en.srt' },
    ]);
    service.close();
  });

  it('exposes embedded text tracks while excluding image subtitles', async () => {
    const service = new TorrentSubtitlesService({
      prepareSubtitleFiles: async () => {},
      getMediaFiles: async () => layout(['Show.S01E02.mkv']),
    } as never);
    const runner = service as unknown as { run: () => Promise<string> };
    jest.spyOn(runner, 'run').mockResolvedValue(
      JSON.stringify({
        streams: [
          { index: 2, codec_name: 'ass', tags: { language: 'eng', title: 'English' } },
          { index: 3, codec_name: 'hdmv_pgs_subtitle' },
        ],
      })
    );
    expect(await service.discover(target())).toMatchObject([
      { provider: 'embedded', streamIndex: 2, language: 'eng', release: 'English' },
    ]);
    service.close();
  });

  it('scopes tracks to the video so episodes of one pack never share subtitles', async () => {
    const service = new TorrentSubtitlesService({
      prepareSubtitleFiles: async () => {},
      getMediaFiles: async () => layout(['Show.S01E01.mkv', 'Show.S01E02.mkv']),
    } as never);
    const runner = service as unknown as { run: () => Promise<string> };
    jest
      .spyOn(runner, 'run')
      .mockResolvedValue(JSON.stringify({ streams: [{ index: 2, codec_name: 'subrip' }] }));

    const [first] = await service.discover(target('Show.S01E01.mkv'));
    const [second] = await service.discover(target('Show.S01E02.mkv'));

    expect(first.fileId).not.toBe(second.fileId);
    expect(second).toMatchObject({ videoFilePath: 'Show.S01E02.mkv' });
    await expect(service.getTrack(target('Show.S01E01.mkv'), second)).rejects.toThrow(
      'Subtitle track belongs to another video'
    );
    service.close();
  });
});
