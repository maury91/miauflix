import type { CreatePlaybackSessionResponse } from '@miauflix/backend';

export function audioLanguage(code: string | null): string | undefined {
  if (!code) return undefined;
  try {
    return new Intl.Locale(code.replace(/_/g, '-')).language;
  } catch {
    return undefined;
  }
}

export function preferredAudioTrack(
  delivery: CreatePlaybackSessionResponse['delivery'],
  languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages
) {
  const tracks = delivery?.audioTracks ?? [];
  for (const language of languages) {
    const wanted = audioLanguage(language);
    if (!wanted) continue;
    const track = tracks.find(track => audioLanguage(track.language) === wanted);
    if (track) return track.index;
  }
  return delivery?.defaultAudioTrackIndex ?? tracks[0]?.index;
}

/** Report actual decoder support; device names cannot tell us which codecs work. */
export function playbackAudioCapabilities(
  video: HTMLVideoElement
): Pick<
  import('@miauflix/backend').CreatePlaybackSessionRequest['preferences'],
  | 'audioLanguages'
  | 'supportedAudioCodecs'
  | 'supportedMseAudioCodecs'
  | 'nativeAudioTracks'
  | 'allowHevc'
  | 'nativeHevcContainers'
  | 'supportedMseVideoCodecs'
> {
  const codecs = {
    aac: 'mp4a.40.2',
    mp3: 'mp4a.69',
    ac3: 'ac-3',
    eac3: 'ec-3',
    dts: 'dtsc',
    opus: 'opus',
    flac: 'flac',
    vorbis: 'vorbis',
  };
  const nativeHevcContainers = (
    [
      ['mp4', 'video/mp4; codecs="hvc1.1.6.L93.B0"'],
      ['matroska', 'video/x-matroska; codecs="hvc1.1.6.L93.B0"'],
    ] as const
  )
    .filter(([, mimeType]) => video.canPlayType(mimeType) !== '')
    .map(([container]) => container);
  return {
    allowHevc: nativeHevcContainers.length > 0,
    nativeHevcContainers,
    supportedMseVideoCodecs: (['h264', 'hevc'] as const).filter(
      codec =>
        typeof MediaSource !== 'undefined' &&
        MediaSource.isTypeSupported(
          `video/mp4; codecs="${codec === 'hevc' ? 'hvc1.1.6.L93.B0' : 'avc1.640028'}, mp4a.40.2"`
        )
    ),
    audioLanguages: [...navigator.languages].slice(0, 20),
    supportedAudioCodecs: (Object.keys(codecs) as Array<keyof typeof codecs>).filter(
      codec => video.canPlayType(`audio/mp4; codecs="${codecs[codec]}"`) !== ''
    ),
    supportedMseAudioCodecs: (Object.keys(codecs) as Array<keyof typeof codecs>).filter(
      codec =>
        typeof MediaSource !== 'undefined' &&
        MediaSource.isTypeSupported(`video/mp4; codecs="avc1.42E01E, ${codecs[codec]}"`)
    ),
    nativeAudioTracks: 'audioTracks' in video,
  };
}
