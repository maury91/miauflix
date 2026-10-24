import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
