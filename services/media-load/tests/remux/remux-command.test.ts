import type { RemuxPlan } from '@miauflix/service-contracts';
import { describe, expect, it } from 'bun:test';

import { buildPlaylist, parsePlaylist, remuxArgs, sidecarFor } from '../../src/remux/remux-command';

const plan: RemuxPlan = {
  videoCodec: 'hevc',
  durationSeconds: 3540,
  audio: [
    {
      audioIndex: 0,
      copy: false,
      channels: 8,
      language: 'eng',
      title: 'TrueHD 7.1',
      isDefault: false,
    },
    { audioIndex: 2, copy: true, channels: 6, language: 'ita', title: null, isDefault: false },
  ],
  subtitles: [
    {
      subtitleIndex: 0,
      kind: 'text',
      codec: 'subrip',
      language: 'eng',
      title: null,
      isDefault: false,
      forced: false,
      hearingImpaired: false,
    },
    {
      subtitleIndex: 1,
      kind: 'styled',
      codec: 'ass',
      language: 'eng',
      title: 'Signs',
      isDefault: false,
      forced: true,
      hearingImpaired: false,
    },
    {
      subtitleIndex: 2,
      kind: 'image',
      codec: 'hdmv_pgs_subtitle',
      language: 'ita',
      title: null,
      isDefault: false,
      forced: false,
      hearingImpaired: false,
    },
    {
      subtitleIndex: 3,
      kind: 'image',
      codec: 'dvd_subtitle',
      language: 'fra',
      title: null,
      isDefault: false,
      forced: false,
      hearingImpaired: false,
    },
  ],
};

const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe('remuxArgs', () => {
  const args = remuxArgs('http://in/input', 'http://out', plan);

  it('copies the video', () => {
    expect(args.join(' ')).toContain('-map 0:v:0 -c:v copy -map 0:a:0');
  });

  it('converts a 7.1 track to 5.1 AC-3 and copies a compatible one', () => {
    expect(args.join(' ')).toContain('-map 0:a:0 -c:a:0 ac3 -b:a:0 640k -ac:a:0 6');
    expect(args.join(' ')).toContain('-map 0:a:2 -c:a:1 copy');
    expect(after(args, '-metadata:s:a:0')).toBe('language=eng');
    // No default track in the source: the first one is.
    expect(after(args, '-disposition:a:0')).toBe('default');
    expect(after(args, '-disposition:a:1')).toBe('0');
  });

  it('writes MPEG-TS HLS with PUT on one thread', () => {
    expect(after(args, '-threads')).toBe('1');
    expect(after(args, '-hls_segment_type')).toBe('mpegts');
    expect(after(args, '-hls_playlist_type')).toBe('event');
    expect(after(args, '-hls_segment_filename')).toBe('http://out/seg%05d.ts');
    expect(args).toContain('http://out/index.m3u8');
  });

  it('keeps every subtitle track as a sidecar', () => {
    const line = args.join(' ');
    expect(line).toContain('-map 0:s:0 -c:s webvtt -f webvtt -method PUT http://out/s0.vtt');
    expect(line).toContain(
      '-map 0:s:1 -map 0:t? -c copy -f matroska -method PUT http://out/s1.mkv'
    );
    expect(line).toContain('-map 0:s:2 -c:s copy -f sup -method PUT http://out/s2.sup');
    expect(line).toContain('-map 0:s:3 -c copy -f matroska -method PUT http://out/s3.mkv');
  });

  it('names sidecars by track and format', () => {
    expect(plan.subtitles.map(track => sidecarFor(track).name)).toEqual([
      's0.vtt',
      's1.mkv',
      's2.sup',
      's3.mkv',
    ]);
  });
});

describe('playlists', () => {
  it('reads segment names and lengths from FFmpeg playlist', () => {
    const parsed = parsePlaylist(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXTINF:6.006000,',
        'seg00000.ts',
        '#EXTINF:4.170833,',
        'http://127.0.0.1:1/t/seg00001.ts',
      ].join('\n')
    );
    expect(parsed).toEqual({
      segments: [
        { name: 'seg00000.ts', duration: 6.006 },
        { name: 'seg00001.ts', duration: 4.170833 },
      ],
      ended: false,
    });
    expect(parsePlaylist('#EXTINF:1,\nseg00000.ts\n#EXT-X-ENDLIST\n').ended).toBe(true);
  });

  it('builds an EVENT playlist, closed once complete', () => {
    const segments = [
      { name: 'seg00000.ts', duration: 6.006 },
      { name: 'seg00001.ts', duration: 7.2 },
    ];
    const open = buildPlaylist(segments, false);
    expect(open).toContain('#EXT-X-PLAYLIST-TYPE:EVENT');
    expect(open).toContain('#EXT-X-TARGETDURATION:8');
    expect(open).not.toContain('#EXT-X-MAP');
    expect(open).toContain('#EXTINF:7.200000,\nseg00001.ts');
    expect(open).not.toContain('ENDLIST');
    expect(buildPlaylist(segments, true)).toContain('#EXT-X-ENDLIST');
  });
});
