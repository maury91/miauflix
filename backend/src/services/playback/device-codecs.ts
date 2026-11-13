/** The codec names Samsung's `webapis.systeminfo` accepts (Tizen 6.0 and newer). */
export const TIZEN_AUDIO_CODECS = [
  'MPEG',
  'MPEG-H',
  'AC3',
  'E-AC3',
  'AC4',
  'TrueHD',
  'Vorbis',
  'G2Cook',
  'AAC',
  'HE-AAC',
  'WMA',
  'ADPCM',
  'OPUS',
  'PCM',
] as const;

export const TIZEN_VIDEO_CODECS = [
  'MPEG1',
  'MPEG2',
  'MPEG4',
  'H263',
  'H264',
  'HEVC',
  'VP8',
  'VP9',
  'RV',
  'WMV',
  'AVS',
  'AVS_PLUS',
  'MJPEG',
  'JPEG',
  'H264_MVC',
  'HEIC',
  'AVS2',
  'HEVC_VR360',
  'H264_VR360',
  'VP9_VR360',
  'HEVC_SHVC',
  'AV1',
  'AV1_VR360',
] as const;

export type TizenAudioCodec = (typeof TIZEN_AUDIO_CODECS)[number];
export type TizenVideoCodec = (typeof TIZEN_VIDEO_CODECS)[number];

/** The ffprobe `codec_name`s each Samsung audio codec name covers. */
const AUDIO_CODEC_NAMES: Record<TizenAudioCodec, string[]> = {
  MPEG: ['mp1', 'mp2', 'mp3'],
  'MPEG-H': ['mpegh_3d_audio'],
  AC3: ['ac3'],
  'E-AC3': ['eac3'],
  AC4: ['ac4'],
  TrueHD: ['truehd', 'mlp'],
  Vorbis: ['vorbis'],
  G2Cook: ['cook'],
  AAC: ['aac'],
  'HE-AAC': ['aac'],
  WMA: ['wmav1', 'wmav2', 'wmapro'],
  ADPCM: ['adpcm_ima_wav', 'adpcm_ms'],
  OPUS: ['opus'],
  PCM: ['pcm_s16le', 'pcm_s16be', 'pcm_s24le', 'pcm_s24be', 'pcm_s32le', 'pcm_f32le', 'pcm_u8'],
};

/** The ffprobe `codec_name`s each Samsung video codec name covers; images and 3D/360 variants map to none. */
const VIDEO_CODEC_NAMES: Record<TizenVideoCodec, string[]> = {
  MPEG1: ['mpeg1video'],
  MPEG2: ['mpeg2video'],
  MPEG4: ['mpeg4'],
  H263: ['h263'],
  H264: ['h264'],
  HEVC: ['hevc'],
  VP8: ['vp8'],
  VP9: ['vp9'],
  RV: ['rv30', 'rv40'],
  WMV: ['wmv1', 'wmv2', 'wmv3', 'vc1'],
  AVS: ['cavs'],
  AVS_PLUS: ['cavs'],
  MJPEG: ['mjpeg'],
  JPEG: [],
  H264_MVC: [],
  HEIC: [],
  AVS2: ['avs2'],
  HEVC_VR360: [],
  H264_VR360: [],
  VP9_VR360: [],
  HEVC_SHVC: [],
  AV1: ['av1'],
  AV1_VR360: [],
};

interface DeviceCodecPreferences {
  allowHevc?: boolean;
  nativeHevcContainers?: Array<'matroska' | 'mp4'>;
  supportedAudioCodecs?: string[];
  supportedVideoCodecs?: string[];
  tizenCodecs?: { audio: TizenAudioCodec[]; video: TizenVideoCodec[] };
}

/**
 * Fold the codecs a Samsung TV reports into the codec lists delivery is decided on, in ffprobe's
 * names. Audio adds to what the client listed (AVPlay plays FLAC, which Samsung's list does not
 * name); video replaces the assumption that every H.264/H.265 file plays, and a TV without HEVC
 * gets no H.265 sources. Without a report the preferences are returned as they are.
 */
export function withDeviceCodecs<T extends DeviceCodecPreferences>(
  preferences: T
): T & { supportedVideoCodecs?: string[] } {
  const reported = preferences.tizenCodecs;
  if (!reported) return preferences;
  const audio = new Set(preferences.supportedAudioCodecs ?? []);
  for (const codec of reported.audio) for (const name of AUDIO_CODEC_NAMES[codec]) audio.add(name);
  const video = new Set(reported.video.flatMap(codec => VIDEO_CODEC_NAMES[codec]));
  const hevc = video.has('hevc');
  return {
    ...preferences,
    supportedAudioCodecs: [...audio],
    supportedVideoCodecs: [...video],
    ...(hevc ? {} : { allowHevc: false, nativeHevcContainers: [] }),
  };
}
