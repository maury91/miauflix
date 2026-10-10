import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { MovieSource } from '@entities/movie-source.entity';

import { AudioPlaybackService } from './audio-playback.service';

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const integration = hasFfmpeg ? describe : describe.skip;

// No provider calls or torrent peers: this fixture models delayed pieces behind an HTTP range reader.
integration('audio conversion with a seekable, delayed range reader', () => {
  let directory: string;
  let fixture: Buffer;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'miauflix-audio-test-'));
    const input = join(directory, 'fixture.mkv');
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=320x180:rate=25',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=880:sample_rate=48000',
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-map',
        '2:a:0',
        '-metadata:s:a:0',
        'language=fra',
        '-metadata:s:a:1',
        'language=eng',
        '-disposition:a:0',
        'default',
        '-disposition:a:1',
        '0',
        '-t',
        '20',
        '-c:v',
        'libx264',
        '-g',
        '100',
        '-c:a',
        'ac3',
        '-y',
        input,
      ],
      { stdio: 'ignore' }
    );
    fixture = await readFile(input);
  });
  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  const setupTest = () => {
    const ranges: number[] = [];
    const download = {
      async streamFile(_source: MovieSource, range?: string) {
        const match = range?.match(/^bytes=(\d+)-(\d*)$/);
        const start = match ? Number(match[1]) : 0;
        const end = match?.[2]
          ? Math.min(fixture.length - 1, Number(match[2]))
          : fixture.length - 1;
        ranges.push(start);
        await new Promise(resolve => setTimeout(resolve, start > 0 ? 50 : 1));
        return new Response(new Uint8Array(fixture.subarray(start, end + 1)), {
          status: match ? 206 : 200,
          headers: {
            'Content-Type': 'video/x-matroska',
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
            ...(match ? { 'Content-Range': `bytes ${start}-${end}/${fixture.length}` } : {}),
          },
        });
      },
    };
    return {
      service: new AudioPlaybackService(download as never),
      source: { id: 1 } as MovieSource,
      ranges,
    };
  };

  it('converts AC-3 to AAC, copies H.264, and seeks forward and backward on the original clock', async () => {
    const { service, source, ranges } = setupTest();
    try {
      expect(await service.inspect(source)).toMatchObject({
        mode: 'audio-transcode',
        audioCodec: 'ac3',
      });
      for (const start of [9, 0, 13]) {
        const response = await service.stream(
          source,
          'owner',
          start,
          new Date(Date.now() + 60_000),
          new AbortController().signal
        );
        const offset = Number(response.headers.get('X-Playback-Timestamp-Offset'));
        const output = join(directory, `output-${start}.mp4`);
        await writeFile(output, Buffer.from(await response.arrayBuffer()));
        const probe = JSON.parse(
          execFileSync(
            'ffprobe',
            [
              '-v',
              'error',
              '-show_entries',
              'stream=codec_name,start_time:packet=stream_index,pts_time,duration_time',
              '-show_packets',
              '-of',
              'json',
              output,
            ],
            { encoding: 'utf8' }
          )
        ) as {
          streams: Array<{ codec_name: string; start_time: string }>;
          packets: Array<{ stream_index: number; pts_time: string; duration_time: string }>;
        };
        expect(probe.streams.map(stream => stream.codec_name)).toEqual(['h264', 'aac']);
        const videoStart = Number(probe.streams[0].start_time) + offset;
        const audioStart = Number(probe.streams[1].start_time) + offset;
        expect(videoStart).toBeLessThanOrEqual(start + 0.1);
        expect(videoStart).toBeGreaterThanOrEqual(Math.max(0, start - 4.1));
        expect(Math.abs(videoStart - audioStart)).toBeLessThan(0.15);
        const videoEnd =
          Math.max(
            ...probe.packets
              .filter(packet => packet.stream_index === 0)
              .map(packet => Number(packet.pts_time) + Number(packet.duration_time))
          ) + offset;
        expect(videoEnd).toBeCloseTo(20.005, 1);
      }
      expect(ranges.some(start => start > 0)).toBe(true);
    } finally {
      await service.close();
    }
  }, 30_000);

  it('selects the requested source language and rejects nonexistent tracks', async () => {
    const { service, source } = setupTest();
    try {
      expect((await service.inspect(source)).audioTracks).toMatchObject([
        { index: 0, language: 'fra', isDefault: true },
        { index: 1, language: 'eng', isDefault: false },
      ]);
      const response = await service.stream(
        source,
        'language',
        0,
        new Date(Date.now() + 60_000),
        new AbortController().signal,
        1
      );
      const output = join(directory, 'english.mp4');
      await writeFile(output, Buffer.from(await response.arrayBuffer()));
      const pcm = execFileSync('ffmpeg', [
        '-v',
        'error',
        '-i',
        output,
        '-map',
        '0:a:0',
        '-t',
        '1',
        '-ac',
        '1',
        '-ar',
        '48000',
        '-f',
        's16le',
        'pipe:1',
      ]);
      // Different tones prove that we converted the selected stream, not just its metadata.
      let crossings = 0;
      for (let sample = 4801; sample < pcm.length / 2; sample++) {
        if (pcm.readInt16LE((sample - 1) * 2) <= 0 && pcm.readInt16LE(sample * 2) > 0) crossings++;
      }
      const frequency = crossings / (pcm.length / 2 / 48000 - 0.1);
      expect(frequency).toBeGreaterThan(870);
      expect(frequency).toBeLessThan(890);
      await expect(
        service.stream(
          source,
          'invalid-track',
          0,
          new Date(Date.now() + 60_000),
          new AbortController().signal,
          2
        )
      ).rejects.toThrow('audio track is unavailable');
    } finally {
      await service.close();
    }
  }, 30_000);

  it('releases conversion capacity after cancellation and rejects invalid positions', async () => {
    const { service, source } = setupTest();
    try {
      for (let iteration = 0; iteration < 3; iteration++) {
        const response = await service.stream(
          source,
          `owner-${iteration}`,
          0,
          new Date(Date.now() + 60_000),
          new AbortController().signal
        );
        await response.body!.cancel();
      }
      await expect(
        service.stream(
          source,
          'invalid',
          Infinity,
          new Date(Date.now() + 60_000),
          new AbortController().signal
        )
      ).rejects.toThrow('outside the movie');
    } finally {
      await service.close();
    }
  }, 30_000);
});
