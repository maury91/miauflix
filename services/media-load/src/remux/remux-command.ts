import type {
  RemuxAudioTrack,
  RemuxPlan,
  RemuxSidecar,
  RemuxSubtitleTrack,
} from '@miauflix/service-contracts';

/** HLS segment length the muxer aims for; segments still cut on video keyframes. */
export const SEGMENT_SECONDS = 6;
export const PLAYLIST_NAME = 'index.m3u8';
export const SEGMENT_PATTERN = /^seg\d{5}\.ts$/;

/** The sidecar file a subtitle track is kept as. */
export function sidecarFor(track: RemuxSubtitleTrack): RemuxSidecar {
  const format =
    track.kind === 'text' ? 'vtt' : track.codec === 'hdmv_pgs_subtitle' ? 'sup' : 'mkv';
  return { ...track, name: `s${track.subtitleIndex}.${format}`, format };
}

/**
 * A converted track, as AC-3: AVPlay (Tizen 5.5) ignores E-AC-3 in MPEG-TS. 5.1 at 640 kbit/s,
 * AC-3's ceiling (7.1 is downmixed), fewer channels less.
 */
const ac3Args = (track: RemuxAudioTrack, output: number): string[] => {
  const channels = track.channels ?? 2;
  const layout =
    channels >= 6
      ? { ac: 6, bitrate: '640k' }
      : channels > 2
        ? { ac: channels, bitrate: '448k' }
        : { ac: Math.max(channels, 1), bitrate: '192k' };
  return [
    `-c:a:${output}`,
    'ac3',
    `-b:a:${output}`,
    layout.bitrate,
    `-ac:a:${output}`,
    String(layout.ac),
  ];
};

const trackMetadata = (
  type: 'a',
  output: number,
  track: { language: string | null; title: string | null }
): string[] => [
  `-metadata:s:${type}:${output}`,
  `language=${track.language ?? 'und'}`,
  ...(track.title ? [`-metadata:s:${type}:${output}`, `title=${track.title}`] : []),
];

/**
 * FFmpeg arguments for a remux: the video copied, the plan's audio tracks copied or converted
 * to AC-3, as MPEG-TS HLS (AVPlay on Tizen 5.5 never finishes preparing fMP4 HLS) uploaded with `PUT` under `outputBase`; and each subtitle track as its
 * own sidecar upload. Runs on one thread.
 */
export function remuxArgs(input: string, outputBase: string, plan: RemuxPlan): string[] {
  const hasDefault = plan.audio.some(track => track.isDefault);
  const audio = plan.audio.flatMap((track, output) => [
    '-map',
    `0:a:${track.audioIndex}`,
    ...(track.copy ? [`-c:a:${output}`, 'copy'] : ac3Args(track, output)),
    ...trackMetadata('a', output, track),
    `-disposition:a:${output}`,
    track.isDefault || (!hasDefault && output === 0) ? 'default' : '0',
  ]);
  const hls = [
    '-map',
    '0:v:0',
    '-c:v',
    'copy',
    ...audio,
    '-map_metadata',
    '-1',
    '-map_chapters',
    '-1',
    '-threads',
    '1',
    '-max_muxing_queue_size',
    '4096',
    '-f',
    'hls',
    '-hls_time',
    String(SEGMENT_SECONDS),
    '-hls_list_size',
    '0',
    '-hls_playlist_type',
    'event',
    '-hls_segment_type',
    'mpegts',
    '-hls_segment_filename',
    `${outputBase}/seg%05d.ts`,
    '-method',
    'PUT',
    `${outputBase}/${PLAYLIST_NAME}`,
  ];
  const sidecars = plan.subtitles.flatMap(track => {
    const sidecar = sidecarFor(track);
    const map = ['-map', `0:s:${track.subtitleIndex}`];
    const target = ['-method', 'PUT', `${outputBase}/${sidecar.name}`];
    if (sidecar.format === 'vtt') return [...map, '-c:s', 'webvtt', '-f', 'webvtt', ...target];
    if (sidecar.format === 'sup') return [...map, '-c:s', 'copy', '-f', 'sup', ...target];
    // Styled tracks keep the release's fonts, which the player extracts from the attachments.
    const fonts = track.kind === 'styled' ? ['-map', '0:t?'] : [];
    return [...map, ...fonts, '-c', 'copy', '-f', 'matroska', ...target];
  });
  return [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-threads',
    '1',
    '-i',
    input,
    ...hls,
    ...sidecars,
  ];
}

export interface PlaylistSegment {
  name: string;
  duration: number;
}

/** The segments FFmpeg's playlist lists, in order, by file name. */
export function parsePlaylist(text: string): { segments: PlaylistSegment[]; ended: boolean } {
  const segments: PlaylistSegment[] = [];
  let duration: number | null = null;
  let ended = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      duration = Number.parseFloat(line.slice('#EXTINF:'.length));
    } else if (line === '#EXT-X-ENDLIST') {
      ended = true;
    } else if (!line.startsWith('#') && duration !== null && Number.isFinite(duration)) {
      segments.push({ name: line.split(/[/?]/).filter(Boolean).at(-1) ?? line, duration });
      duration = null;
    }
  }
  return { segments, ended };
}

/** An HLS `EVENT` playlist of the stored segments, closed when the remux is complete. */
export function buildPlaylist(segments: PlaylistSegment[], complete: boolean): string {
  const target = Math.max(SEGMENT_SECONDS, ...segments.map(segment => Math.ceil(segment.duration)));
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${target}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:EVENT',
    ...segments.flatMap(segment => [`#EXTINF:${segment.duration.toFixed(6)},`, segment.name]),
    ...(complete ? ['#EXT-X-ENDLIST'] : []),
    '',
  ].join('\n');
}
