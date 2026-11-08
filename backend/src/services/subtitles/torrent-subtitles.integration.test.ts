import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildTestFont, testAssHeader } from '@__test-utils__/font';

import type { ContentSource } from '@entities/content-source.entity';
import type { PlaybackTarget } from '@services/playback/playback-target';

import { TorrentSubtitlesService } from './torrent-subtitles.service';

const integration =
  spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0 ? describe : describe.skip;

// Entirely offline: real MKV, SRT and ASS fixtures behind the same HTTP range seam as playback.
integration('torrent and embedded subtitle delivery', () => {
  let directory: string;
  let media: Buffer;
  let sidecar: Buffer;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'miauflix-local-subs-'));
    const srt = join(directory, 'fixture.srt');
    await writeFile(
      srt,
      '1\n00:00:01,000 --> 00:00:03,000\nFirst cue\n\n2\n00:01:10,000 --> 00:01:12,000\nAfter seek\n\n3\n00:04:20,000 --> 00:04:22,000\nDistant cue\n'
    );
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=size=160x90:rate=1',
        '-i',
        srt,
        '-map',
        '0:v',
        '-map',
        '1:s',
        '-metadata:s:s:0',
        'language=eng',
        '-c:v',
        'libx264',
        '-c:s',
        'ass',
        '-t',
        '300',
        '-y',
        join(directory, 'Movie.mkv'),
      ],
      { stdio: 'ignore' }
    );
    execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', srt, '-c:s', 'ass', '-y', join(directory, 'Movie.en.ass')],
      { stdio: 'ignore' }
    );
    media = await readFile(join(directory, 'Movie.mkv'));
    sidecar = await readFile(join(directory, 'Movie.en.ass'));
  }, 30_000);
  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  const setupTest = () => {
    const source: PlaybackTarget = {
      source: { id: 9 } as ContentSource,
      filePath: 'Movie.mkv',
      matchKind: 'movie',
    };
    const download = {
      prepareSubtitleFiles: async () => {},
      getMediaFiles: async () => ({
        storeName: 'fixture',
        filenameSalt: 'salt',
        pieceLength: 1024,
        files: [
          { path: 'Movie.mkv', offset: 0, length: media.length },
          { path: 'Movie.en.ass', offset: media.length, length: sidecar.length },
        ],
      }),
      async streamFile(target: PlaybackTarget, range?: string) {
        const bytes = target.filePath === 'Movie.en.ass' ? sidecar : media;
        const match = range?.match(/^bytes=(\d+)-(\d*)$/);
        const start = match ? Number(match[1]) : 0;
        const end = match?.[2] ? Math.min(bytes.length - 1, Number(match[2])) : bytes.length - 1;
        return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
          status: match ? 206 : 200,
          headers: {
            'Content-Length': String(end - start + 1),
            'Accept-Ranges': 'bytes',
            ...(match ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}),
          },
        });
      },
    };
    return { source, service: new TorrentSubtitlesService(download as never) };
  };

  it('discovers embedded ASS plus a matching torrent ASS and converts both to sanitized WebVTT', async () => {
    const { source, service } = setupTest();
    try {
      const tracks = await service.discover(source);
      expect(tracks.map(track => track.provider)).toEqual(['embedded', 'torrent']);
      for (const track of tracks) {
        const body = await service.getTrack(source, track);
        expect(body).toMatch(/^WEBVTT/);
        expect(body).toMatch(/(?:00:)?00:01\.000 --> (?:00:)?00:03\.000/);
        expect(body).toContain('First cue');
        expect(body).not.toContain('[Script Info]');
      }
    } finally {
      service.close();
    }
  }, 30_000);

  it('delivers styled tracks as ASS, windowed for embedded tracks and whole for sidecars', async () => {
    const { source, service } = setupTest();
    try {
      const [embedded, sidecarTrack] = await service.discover(source);
      expect(embedded.styled).toBe(true);
      expect(sidecarTrack.styled).toBe(true);
      const windowed = await service.getAssTrack(source, embedded, 60);
      expect(windowed).toMatch(/^\[Script Info\]/);
      expect(windowed).toContain('[V4+ Styles]');
      expect(windowed).toMatch(/Dialogue: 0,0:01:10\.00,0:01:12\.00,[^\n]*After seek/);
      expect(windowed).not.toContain('First cue');
      expect(windowed).not.toContain('Distant cue');
      const whole = await service.getAssTrack(source, sidecarTrack);
      expect(whole).toContain('First cue');
      expect(whole).toContain('Distant cue');
    } finally {
      service.close();
    }
  }, 30_000);

  it('keeps the original clock after seeking and bounds extraction to the nearby window', async () => {
    const { source, service } = setupTest();
    try {
      const track = (await service.discover(source))[0];
      const body = await service.getTrack(source, track, 60);
      expect(body).toMatch(/(?:00:)?01:10\.000 --> (?:00:)?01:12\.000/);
      expect(body).toContain('After seek');
      expect(body).not.toContain('First cue');
      expect(body).not.toContain('Distant cue');
      expect(await service.getTrack(source, track, 180)).toContain('Distant cue');
    } finally {
      service.close();
    }
  }, 30_000);
});

integration('fonts attached to a release', () => {
  let directory: string;
  let media: Buffer;
  const fonts = {
    other: buildTestFont({ family: 'Sign Display' }),
    regular: buildTestFont({ family: 'Miauflix Sans' }),
    bold: buildTestFont({ family: 'Miauflix Sans', subfamily: 'Bold', bold: true }),
  };
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'miauflix-sub-fonts-'));
    const ass = join(directory, 'subs.ass');
    await writeFile(
      ass,
      `${testAssHeader([
        { name: 'Sign', font: 'Sign Display' },
        { name: 'Default', font: 'Miauflix Sans', bold: true },
      ])}Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,First cue\n`
    );
    const attach: string[] = [];
    for (const [index, [name, data]] of Object.entries(fonts).entries()) {
      const path = join(
        directory,
        `${name === 'other' ? 'SignDisplay' : `MiauflixSans-${name}`}.ttf`
      );
      await writeFile(path, data);
      attach.push(
        '-attach',
        path,
        `-metadata:s:t:${index}`,
        'mimetype=application/x-truetype-font'
      );
    }
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=size=160x90:rate=1',
        '-i',
        ass,
        '-map',
        '0:v',
        '-map',
        '1:s',
        '-c:v',
        'libx264',
        '-c:s',
        'ass',
        ...attach,
        '-t',
        '10',
        '-y',
        join(directory, 'Episode.mkv'),
      ],
      { stdio: 'ignore' }
    );
    media = await readFile(join(directory, 'Episode.mkv'));
  }, 30_000);
  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('lists the fonts with the styled track and serves the dialogue face closest in weight', async () => {
    const target: PlaybackTarget = {
      source: { id: 10 } as ContentSource,
      filePath: 'Episode.mkv',
      matchKind: 'single',
    };
    const download = {
      prepareSubtitleFiles: async () => {},
      getMediaFiles: async () => ({
        storeName: 'fixture',
        filenameSalt: 'salt',
        pieceLength: 1024,
        files: [{ path: 'Episode.mkv', offset: 0, length: media.length }],
      }),
      async streamFile(_target: PlaybackTarget, range?: string) {
        const match = range?.match(/^bytes=(\d+)-(\d*)$/);
        const start = match ? Number(match[1]) : 0;
        const end = match?.[2] ? Math.min(media.length - 1, Number(match[2])) : media.length - 1;
        return new Response(new Uint8Array(media.subarray(start, end + 1)), {
          status: match ? 206 : 200,
          headers: {
            'Content-Length': String(end - start + 1),
            'Accept-Ranges': 'bytes',
            ...(match ? { 'Content-Range': `bytes ${start}-${end}/${media.length}` } : {}),
          },
        });
      },
    };
    const service = new TorrentSubtitlesService(download as never);
    try {
      const [track] = await service.discover(target);
      expect(track.fonts?.map(font => font.filename)).toEqual([
        'SignDisplay.ttf',
        'MiauflixSans-regular.ttf',
        'MiauflixSans-bold.ttf',
      ]);
      const { font } = await service.getFont(target, track);
      expect(font?.format).toBe('ttf');
      expect(font?.data.equals(fonts.bold)).toBe(true);
      // The track itself still converts, attachments and all.
      expect(await service.getTrack(target, track)).toContain('First cue');
      expect(await service.getAssTrack(target, track)).toMatch(
        /Style: Sign,Sign Display,[\s\S]*Dialogue: 0,0:00:01\.00,0:00:03\.00,Default,[^\n]*First cue/
      );
      // A full renderer gets every attached font, by the names it looks them up with.
      const { fonts: all, complete } = await service.getFonts(target, track);
      expect(complete).toBe(true);
      expect(all.map(font => font.names[0])).toEqual([
        'sign display',
        'miauflix sans',
        'miauflix sans',
      ]);
      expect(all[2].data.equals(fonts.bold)).toBe(true);
    } finally {
      service.close();
    }
  }, 60_000);
});
