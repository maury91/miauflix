import { type ChildProcess, spawn } from 'node:child_process';

import { logger } from '@logger';

import type { ConfigService } from '@mytypes/configuration';
import type { MediaProbeRepository } from '@repositories/media-probe.repository';
import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';

import type { TizenAudioCodec, TizenVideoCodec } from './device-codecs';
import { FragmentedMp4Timeline } from './fragmented-mp4';
import type { PlaybackTarget } from './playback-target';
import { openSourceInput, PROBE_SIZE_BYTES } from './source-input';
import { collectStderr } from './stderr-tail';

export interface PlaybackAudioTrack {
  index: number;
  language: string | null;
  title: string | null;
  codec: string | null;
  channels: number | null;
  isDefault: boolean;
  copyAudio?: boolean;
  canPlayDirect?: boolean;
  mimeType?: string;
}

export interface PlaybackDelivery {
  /** `remux`: the file's TV remux (HLS, audio the TV decodes), played natively. */
  mode: 'audio-transcode' | 'direct' | 'remux';
  transcodeVideo?: boolean;
  videoCodec?: 'h264' | 'hevc';
  audioCodec: string | null;
  durationSeconds: number;
  /** Start time from an explicit end-credits chapter tag, when one exists. */
  creditsStartSeconds?: number;
  /** Where a post-credits scene starts: the credits are skipped to it instead of ending. */
  creditsEndSeconds?: number;
  /** The opening (an "Intro"/"Opening"/"OP" chapter), which the player offers to skip. */
  introStartSeconds?: number;
  introEndSeconds?: number;
  mimeType: string;
  audioTracks?: PlaybackAudioTrack[];
  defaultAudioTrackIndex?: number;
}

export interface AudioPlaybackPreferences {
  allowHevc?: boolean;
  supportedMseVideoCodecs?: Array<'h264' | 'hevc'>;
  nativeHevcContainers?: Array<'matroska' | 'mp4'>;
  audioLanguages?: string[];
  supportedAudioCodecs?: string[];
  supportedMseAudioCodecs?: string[];
  /** Video codecs (ffprobe names) the client decodes natively; unset assumes H.264 and H.265. */
  supportedVideoCodecs?: string[];
  nativeAudioTracks?: boolean;
  /** Look for another source before converting audio (see PlaybackSessionService). */
  avoidAudioConversion?: boolean;
  /** Plays a TV remux (HLS) instead of converted audio, once one is ready (see TvRemuxService). */
  playsRemux?: boolean;
  /** What a Samsung TV reports it decodes, folded into the lists above by `withDeviceCodecs`. */
  tizenCodecs?: { audio: TizenAudioCodec[]; video: TizenVideoCodec[] };
}

export class AudioPlaybackError extends Error {
  constructor(
    message: string,
    readonly status: 422 | 503 = 503,
    /** What FFmpeg reported, for the logs; never sent to the client. */
    readonly detail?: string
  ) {
    super(message);
  }
}

export class AudioConversionRequiredError extends AudioPlaybackError {
  constructor(message: string) {
    super(message, 422);
  }
}

export interface ProbeResult {
  format?: { duration?: string; format_name?: string };
  chapters?: Array<{ start_time?: string; tags?: { title?: string } }>;
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    extradata?: string;
    channels?: number;
    tags?: { language?: string; title?: string };
    disposition?: { default?: number; forced?: number; hearing_impaired?: number };
  }>;
}

/** Chapter titles that mark end credits, including the anime ED. */
const CREDITS_CHAPTER =
  /^(?:(?:closing|end(?:ing)?)\s+credits|credits(?:\s+roll)?|ed\d*|ending(?:\s+(?:song|theme))?|outro)$/;
/** What may follow the credits without being part of the episode itself. */
const AFTER_CREDITS_CHAPTER =
  /^(?:(?:next\s+(?:episode\s+)?)?preview|next\s+time|eye\s*catch|logo|sponsors?|end\s*card)$/;

/** Chapter titles that mark the opening sequence, including the anime OP. */
const INTRO_CHAPTER =
  /^(?:intro|opening(?:\s+(?:song|theme|credits|titles))?|op\d*|title\s+sequence|main\s+titles)$/;
/** Longer "intros" are mislabelled episode content and are not offered for skipping. */
const MAX_INTRO_SECONDS = 5 * 60;

function chapterTitle(chapter: { tags?: { title?: string } }): string {
  return (chapter.tags?.title ?? '').trim().toLowerCase();
}

export interface CreditsChapters {
  start: number;
  /** Where the episode carries on after the credits (a post-credits scene); unset when it ends. */
  end?: number;
}

/**
 * End credits from chapter titles: the first credits chapter in the second half of the video.
 * When the episode goes on after them (anime often keeps a scene after the ED), `end` is where
 * it resumes; previews and end cards in between are skipped with the credits.
 */
export function explicitCredits(
  probe: Pick<ProbeResult, 'chapters'>,
  durationSeconds = 0
): CreditsChapters | undefined {
  const chapters = (probe.chapters ?? [])
    .map(chapter => ({ start: Number(chapter.start_time), title: chapterTitle(chapter) }))
    .filter(chapter => Number.isFinite(chapter.start) && chapter.start >= 0)
    .sort((left, right) => left.start - right.start);
  const index = chapters.findIndex(
    chapter =>
      CREDITS_CHAPTER.test(chapter.title) &&
      // Opening credits are never skipped.
      (!(durationSeconds > 0) || chapter.start >= durationSeconds / 2)
  );
  if (index === -1) return undefined;
  const resume = chapters
    .slice(index + 1)
    .find(
      chapter => !CREDITS_CHAPTER.test(chapter.title) && !AFTER_CREDITS_CHAPTER.test(chapter.title)
    );
  const start = chapters[index].start;
  return resume &&
    resume.start > start &&
    (!(durationSeconds > 0) || resume.start < durationSeconds)
    ? { start, end: resume.start }
    : { start };
}

/**
 * The opening from chapter titles: the first intro chapter in the first half of the video, up
 * to the next chapter that is not part of it.
 */
export function explicitIntro(
  probe: Pick<ProbeResult, 'chapters'>,
  durationSeconds = 0
): { start: number; end: number } | undefined {
  const chapters = (probe.chapters ?? [])
    .map(chapter => ({ start: Number(chapter.start_time), title: chapterTitle(chapter) }))
    .filter(chapter => Number.isFinite(chapter.start) && chapter.start >= 0)
    .sort((left, right) => left.start - right.start);
  const index = chapters.findIndex(
    chapter =>
      INTRO_CHAPTER.test(chapter.title) &&
      (!(durationSeconds > 0) || chapter.start < durationSeconds / 2)
  );
  if (index === -1) return undefined;
  const start = chapters[index].start;
  const end = chapters.slice(index + 1).find(chapter => !INTRO_CHAPTER.test(chapter.title))?.start;
  if (end === undefined || end <= start || end - start > MAX_INTRO_SECONDS) return undefined;
  if (durationSeconds > 0 && end >= durationSeconds) return undefined;
  return { start, end };
}

function chapterFields(
  probe: ProbeResult,
  durationSeconds: number
): Pick<
  PlaybackDelivery,
  'creditsEndSeconds' | 'creditsStartSeconds' | 'introEndSeconds' | 'introStartSeconds'
> {
  const credits = explicitCredits(probe, durationSeconds);
  const intro = explicitIntro(probe, durationSeconds);
  return {
    ...(credits ? { creditsStartSeconds: credits.start } : {}),
    ...(credits?.end !== undefined ? { creditsEndSeconds: credits.end } : {}),
    ...(intro ? { introStartSeconds: intro.start, introEndSeconds: intro.end } : {}),
  };
}

function nativeHevcContainer(formatName: string | undefined): 'matroska' | 'mp4' | undefined {
  const formats = new Set((formatName ?? '').split(',').map(format => format.trim().toLowerCase()));
  if (['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].some(format => formats.has(format))) {
    return 'mp4';
  }
  if (formats.has('matroska')) return 'matroska';
  return undefined;
}

/** RFC 6381 codec parameter from the HEVCDecoderConfigurationRecord header. */
function hevcCodec(extradata: string | undefined): string | undefined {
  const hex = extradata?.match(/00000000:\s+([\da-f ]+)/i)?.[1].replace(/\s/g, '');
  if (!hex || hex.length < 26 || !hex.startsWith('01')) return undefined;
  const header = Buffer.from(hex, 'hex');
  const profile = `${['', 'A', 'B', 'C'][header[1] >> 6]}${header[1] & 31}`;
  let compatibility = header.readUInt32BE(2);
  let reversed = 0;
  for (let bit = 0; bit < 32; bit++) {
    reversed = (reversed * 2 + (compatibility & 1)) >>> 0;
    compatibility >>>= 1;
  }
  const constraints = [...header.subarray(6, 12)];
  while (constraints.at(-1) === 0) constraints.pop();
  return `hvc1.${profile}.${reversed.toString(16).toUpperCase()}.${header[1] & 32 ? 'H' : 'L'}${header[12]}${constraints.map(byte => `.${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('')}`;
}

/** Inspect actual streams and expose selectable audio tracks without changing video. */
export function deliveryFromProbe(
  probe: ProbeResult,
  preferences: AudioPlaybackPreferences = {},
  convertHevc = false
): PlaybackDelivery {
  const video = probe.streams?.find(stream => stream.codec_type === 'video');
  const audioTracks: PlaybackAudioTrack[] = (probe.streams ?? [])
    .filter(stream => stream.codec_type === 'audio')
    .map((stream, index) => ({
      index,
      language: stream.tags?.language ?? null,
      title: stream.tags?.title ?? null,
      codec: stream.codec_name ?? null,
      channels: stream.channels ?? null,
      isDefault: stream.disposition?.default === 1,
    }));
  let defaultAudioTrackIndex = audioTracks.find(track => track.isDefault)?.index ?? 0;
  const normalizeLanguage = (language: string) => {
    try {
      return new Intl.Locale(language.replace(/_/g, '-')).language;
    } catch {
      return language;
    }
  };
  for (const language of preferences.audioLanguages ?? []) {
    const wanted = normalizeLanguage(language);
    const match = audioTracks.find(
      track => track.language && normalizeLanguage(track.language) === wanted
    );
    if (match) {
      defaultAudioTrackIndex = match.index;
      break;
    }
  }
  let audio = audioTracks[defaultAudioTrackIndex];
  const durationSeconds = Number(probe.format?.duration);
  if (!video || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new AudioPlaybackError('The selected source has no usable video duration.', 422);
  }
  const supported = preferences.supportedAudioCodecs ?? ['aac', 'mp3', 'opus', 'vorbis', 'flac'];
  if (audio && !supported.includes(audio.codec ?? '') && preferences.nativeAudioTracks) {
    // A player that switches tracks itself plays a decodable track (e.g. the AC-3 beside a
    // TrueHD default) as it is, preferably in the same language, instead of converting audio.
    const playable = audioTracks.filter(track => supported.includes(track.codec ?? ''));
    const replacement =
      playable.find(
        track =>
          !!audio.language &&
          !!track.language &&
          normalizeLanguage(track.language) === normalizeLanguage(audio.language)
      ) ?? (audio.language ? undefined : playable[0]);
    if (replacement) {
      defaultAudioTrackIndex = replacement.index;
      audio = replacement;
    }
  }
  let audioCodec = audio?.codec ?? null;
  let compatible = !audio || supported.includes(audioCodec ?? '');
  const avc = video.extradata?.match(/00000000:\s+([\da-f ]+)/i)?.[1].replace(/\s/g, '');
  const usableAvc = video.codec_name === 'h264' && !!avc?.startsWith('01') && avc.length >= 8;
  const hevc = video.codec_name === 'hevc' ? hevcCodec(video.extradata) : undefined;
  const copyHevc = !!hevc && preferences.supportedMseVideoCodecs?.includes('hevc');
  const nativeContainer = nativeHevcContainer(probe.format?.format_name);
  const nativeVideo =
    (preferences.supportedVideoCodecs === undefined ||
      preferences.supportedVideoCodecs.includes(video.codec_name ?? '')) &&
    (video.codec_name !== 'hevc' ||
      (preferences.nativeHevcContainers === undefined
        ? preferences.allowHevc !== false
        : nativeContainer !== undefined &&
          preferences.nativeHevcContainers.includes(nativeContainer)));
  let videoCodec = usableAvc ? `avc1.${avc!.slice(2, 8)}` : copyHevc ? hevc : undefined;
  const transcodeVideo =
    video.codec_name === 'hevc' &&
    convertHevc &&
    !copyHevc &&
    (!nativeVideo ||
      !compatible ||
      (defaultAudioTrackIndex !== (audioTracks.find(track => track.isDefault)?.index ?? 0) &&
        !preferences.nativeAudioTracks));
  if (transcodeVideo) videoCodec = 'avc1.640029';
  const containerDefault = audioTracks.find(track => track.isDefault)?.index ?? 0;
  const selectionRequiresConversion =
    defaultAudioTrackIndex !== containerDefault && !preferences.nativeAudioTracks;
  if (compatible && selectionRequiresConversion && !videoCodec && !transcodeVideo) {
    // Without a usable AVC header keep the container's default track playable.
    defaultAudioTrackIndex = containerDefault;
    audio = audioTracks[defaultAudioTrackIndex];
    audioCodec = audio?.codec ?? null;
    compatible = !audio || supported.includes(audioCodec ?? '');
  }
  const direct =
    nativeVideo && !transcodeVideo && compatible && (!selectionRequiresConversion || !videoCodec);
  const audioCodecs: Record<string, string> = {
    aac: 'mp4a.40.2',
    mp3: 'mp4a.69',
    ac3: 'ac-3',
    eac3: 'ec-3',
    opus: 'opus',
    flac: 'flac',
  };
  for (const track of audioTracks) {
    track.canPlayDirect = supported.includes(track.codec ?? '');
    track.copyAudio =
      (preferences.supportedMseAudioCodecs ?? supported).includes(track.codec ?? '') &&
      !!audioCodecs[track.codec ?? ''];
    track.mimeType = videoCodec
      ? `video/mp4; codecs="${videoCodec}, ${track.copyAudio ? audioCodecs[track.codec!] : 'mp4a.40.2'}"`
      : undefined;
  }
  if (direct)
    return {
      mode: 'direct',
      videoCodec: video.codec_name === 'hevc' ? 'hevc' : 'h264',
      audioCodec,
      durationSeconds,
      ...chapterFields(probe, durationSeconds),
      mimeType: '',
      audioTracks,
      defaultAudioTrackIndex,
    };
  if (!nativeVideo && !copyHevc && !transcodeVideo)
    throw new AudioConversionRequiredError(
      video.codec_name === 'hevc'
        ? 'This client cannot decode H.265 and video conversion is disabled.'
        : `This client cannot decode ${video.codec_name ?? 'this'} video.`
    );
  if (video.codec_name !== 'h264' && !copyHevc && !transcodeVideo) {
    throw new AudioConversionRequiredError('Audio conversion requires an H.264 video source.');
  }
  if (!videoCodec) {
    throw new AudioConversionRequiredError(
      'The selected source has no usable H.264 configuration.'
    );
  }
  return {
    mode: 'audio-transcode',
    transcodeVideo,
    videoCodec: transcodeVideo ? 'h264' : video.codec_name === 'hevc' ? 'hevc' : 'h264',
    audioCodec,
    audioTracks,
    defaultAudioTrackIndex,
    durationSeconds,
    ...chapterFields(probe, durationSeconds),
    mimeType: audio?.mimeType ?? `video/mp4; codecs="${videoCodec}, mp4a.40.2"`,
  };
}

export function audioConversionArgs(
  input: string,
  startSeconds: number,
  audioTrackIndex = 0,
  copyAudio = false,
  videoMode: 'copy' | 'hevc' | 'transcode' = 'copy'
): string[] {
  return [
    '-nostdin',
    '-v',
    'error',
    '-rw_timeout',
    '60000000',
    '-protocol_whitelist',
    'http,tcp',
    '-format_whitelist',
    'matroska,webm,mov,avi,asf,flv,ogg,mp3',
    '-ss',
    String(startSeconds),
    '-noaccurate_seek',
    '-copyts',
    '-start_at_zero',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    `0:a:${audioTrackIndex}`,
    '-c:v',
    ...(videoMode === 'transcode'
      ? [
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-pix_fmt',
          'yuv420p',
          '-vf',
          'scale=w=min(1920\\,iw):h=min(1080\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2',
          '-r',
          '30',
          '-profile:v',
          'high',
          '-level:v',
          '4.1',
          '-g',
          '60',
        ]
      : ['copy', ...(videoMode === 'hevc' ? ['-tag:v', 'hvc1'] : [])]),
    '-c:a',
    ...(copyAudio ? ['copy'] : ['aac', '-ac', '2', '-b:a', '192k']),
    '-threads',
    '1',
    '-avoid_negative_ts',
    'disabled',
    // delay_moov preserves the original clock; empty_moov would reset every seek to zero.
    '-movflags',
    'delay_moov+frag_keyframe+default_base_moof',
    '-f',
    'mp4',
    'pipe:1',
  ];
}

interface ConversionJob {
  controller: AbortController;
  done: Promise<void>;
}

/** Bounded, disk-free audio conversion over the existing decrypted torrent range reader. */
export class AudioPlaybackService {
  private readonly probes = new Map<
    string,
    { expires: number; value: Promise<ProbeResult>; result?: ProbeResult }
  >();
  private readonly jobs = new Map<string, ConversionJob>();
  private readonly processes = new Set<ChildProcess>();
  private closed = false;

  constructor(
    private readonly mediaLoad: MediaLoadClientService,
    private readonly config?: ConfigService,
    private readonly store?: Pick<MediaProbeRepository, 'find' | 'save'>
  ) {}

  canConvertHevc(): boolean {
    return this.config?.get('CONVERT_H265_TO_H264') === true;
  }

  async inspect(
    target: PlaybackTarget,
    preferences: AudioPlaybackPreferences = {},
    speculative = false,
    signal?: AbortSignal
  ): Promise<PlaybackDelivery> {
    signal?.throwIfAborted();
    if (this.closed) throw new AudioPlaybackError('Audio playback is shutting down.');
    const cacheKey = `${target.source.id}:${target.filePath}`;
    const cached = this.probes.get(cacheKey);
    if (cached && cached.expires > Date.now())
      return deliveryFromProbe(await cached.value, preferences, this.canConvertHevc());
    if (this.probes.size >= 64) {
      for (const [id, entry] of this.probes)
        if (entry.expires <= Date.now()) this.probes.delete(id);
      if (this.probes.size >= 64) this.probes.delete(this.probes.keys().next().value!);
    }
    const value = this.storedOrProbe(target, speculative, signal)
      .then(result => {
        const entry = this.probes.get(cacheKey);
        if (entry?.value === value) entry.result = result;
        return result;
      })
      .catch(error => {
        if (this.probes.get(cacheKey)?.value === value) this.probes.delete(cacheKey);
        throw error;
      });
    this.probes.set(cacheKey, { expires: Date.now() + 15 * 60_000, value });
    const cancelCache = () => {
      if (this.probes.get(cacheKey)?.value === value) this.probes.delete(cacheKey);
    };
    signal?.addEventListener('abort', cancelCache, { once: true });
    try {
      return deliveryFromProbe(await value, preferences, this.canConvertHevc());
    } finally {
      signal?.removeEventListener('abort', cancelCache);
    }
  }

  /**
   * Delivery from a probe that already finished, in memory or stored, without starting one.
   * Null means the file's streams are still unknown.
   */
  async knownDelivery(
    target: PlaybackTarget,
    preferences: AudioPlaybackPreferences = {}
  ): Promise<PlaybackDelivery | null> {
    const cached = this.probes.get(`${target.source.id}:${target.filePath}`);
    let result = cached && cached.expires > Date.now() ? cached.result : undefined;
    if (!result) {
      const stored = await this.store?.find(target.source.id, target.filePath).catch(() => null);
      if (stored) result = JSON.parse(stored) as ProbeResult;
    }
    return result ? deliveryFromProbe(result, preferences, this.canConvertHevc()) : null;
  }

  /** The streams of a file whose probe already finished, in memory or stored; null when unknown. */
  async knownProbe(target: PlaybackTarget): Promise<ProbeResult | null> {
    const cached = this.probes.get(`${target.source.id}:${target.filePath}`);
    if (cached && cached.expires > Date.now() && cached.result) return cached.result;
    const stored = await this.store?.find(target.source.id, target.filePath).catch(() => null);
    return stored ? (JSON.parse(stored) as ProbeResult) : null;
  }

  /** A file's streams, probed (and stored) when unknown; reads count as speculative. */
  async probeFile(target: PlaybackTarget, signal?: AbortSignal): Promise<ProbeResult> {
    return (await this.knownProbe(target)) ?? this.storedOrProbe(target, true, signal);
  }

  /** A torrent file never changes, so a stored probe is reused instead of reading it again. */
  private async storedOrProbe(
    target: PlaybackTarget,
    speculative: boolean,
    signal?: AbortSignal
  ): Promise<ProbeResult> {
    const stored = await this.store?.find(target.source.id, target.filePath).catch(() => null);
    if (stored) return JSON.parse(stored) as ProbeResult;
    const result = await this.probe(target, speculative, signal);
    await this.store
      ?.save(target.source.id, target.filePath, JSON.stringify(result))
      .catch(error => logger.warn('AudioPlaybackService', 'Failed to store media probe', error));
    return result;
  }

  private async probe(
    target: PlaybackTarget,
    speculative = false,
    signal?: AbortSignal
  ): Promise<ProbeResult> {
    logger.debug('AudioPlaybackService', 'Inspecting source audio', {
      sourceId: target.source.id,
      speculative,
    });
    const input = await openSourceInput(this.mediaLoad, target, speculative);
    try {
      const result = (await this.runProbe(
        input.url,
        [
          '-show_streams',
          '-show_format',
          '-show_entries',
          'stream=codec_type,codec_name,channels:stream_tags=language,title:stream_disposition=default,forced,hearing_impaired:chapter=start_time:chapter_tags=title:format=duration,format_name',
        ],
        signal,
        input.close
      )) as ProbeResult;
      // Only the video header is dumped: fonts attached to anime releases are streams too, and
      // dumping their data would run to megabytes.
      const video = result.streams?.find(stream => stream.codec_type === 'video');
      if (video) {
        const data = (await this.runProbe(
          input.url,
          ['-select_streams', 'v:0', '-show_data', '-show_entries', 'stream=extradata'],
          signal,
          input.close
        )) as ProbeResult;
        const extradata = data.streams?.[0]?.extradata;
        if (extradata) video.extradata = extradata;
      }
      return result;
    } finally {
      await input.close();
    }
  }

  private async runProbe(
    url: string,
    args: string[],
    signal: AbortSignal | undefined,
    closeInput: () => Promise<void>
  ): Promise<unknown> {
    signal?.throwIfAborted();
    if (this.closed || this.processes.size >= 4)
      throw new AudioPlaybackError('Audio preparation is busy. Retry shortly.');
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'error',
        '-rw_timeout',
        '30000000',
        '-protocol_whitelist',
        'http,tcp',
        '-format_whitelist',
        'matroska,webm,mov,avi,asf,flv,ogg,mp3',
        // Container headers carry everything inspected; the 5 MB default waits on extra pieces.
        '-probesize',
        String(PROBE_SIZE_BYTES),
        ...args,
        '-of',
        'json',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    this.processes.add(child);
    const cancel = () => {
      this.processes.delete(child);
      child.kill('SIGKILL');
      void closeInput();
    };
    signal?.addEventListener('abort', cancel, { once: true });
    let body = '';
    let failure: string | undefined;
    child.stdout.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        failure = 'ffprobe output is too large';
        child.kill('SIGKILL');
      }
    });
    const stderr = collectStderr(child.stderr);
    const timeout = setTimeout(() => {
      failure = 'ffprobe timed out';
      child.kill('SIGKILL');
    }, 45_000);
    timeout.unref();
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('error', () =>
          reject(new AudioPlaybackError('FFmpeg is unavailable. Install FFmpeg on the backend.'))
        );
        child.once('close', code =>
          code === 0 && !failure
            ? resolve()
            : reject(
                new AudioPlaybackError(
                  'The source audio could not be inspected. Retry playback.',
                  503,
                  failure ?? (stderr() || `ffprobe exited with ${code}`)
                )
              )
        );
      });
      return JSON.parse(body);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      this.processes.delete(child);
    }
  }

  async stream(
    target: PlaybackTarget,
    owner: string,
    startSeconds: number,
    expiresAt: Date,
    signal: AbortSignal,
    audioTrackIndex?: number,
    copyAudio = false,
    transcodeVideo = false
  ): Promise<Response> {
    if (transcodeVideo && !this.canConvertHevc())
      throw new AudioPlaybackError('Video conversion is disabled.', 422);
    // Reinspect the source; query parameters cannot enable conversion against server policy.
    const delivery = await this.inspect(target, {
      supportedAudioCodecs: ['aac', 'mp3', 'ac3', 'eac3', 'opus', 'flac', 'vorbis'],
      nativeAudioTracks: true,
      allowHevc: !transcodeVideo,
      supportedMseVideoCodecs: transcodeVideo ? ['h264'] : ['h264', 'hevc'],
    });
    if (
      !Number.isFinite(startSeconds) ||
      startSeconds < 0 ||
      startSeconds >= delivery.durationSeconds
    ) {
      throw new AudioPlaybackError(
        'The requested playback position is outside the selected video.',
        422
      );
    }
    const selectedAudioTrack = audioTrackIndex ?? delivery.defaultAudioTrackIndex ?? 0;
    if (
      !Number.isInteger(selectedAudioTrack) ||
      !delivery.audioTracks?.some(track => track.index === selectedAudioTrack)
    ) {
      throw new AudioPlaybackError('The requested audio track is unavailable.', 422);
    }
    if (!delivery.audioTracks?.find(track => track.index === selectedAudioTrack)?.mimeType)
      throw new AudioPlaybackError('The selected source cannot be remuxed for playback.', 422);
    const previous = this.jobs.get(owner);
    previous?.controller.abort();
    const controller = new AbortController();
    let resolveDone!: () => void;
    const done = new Promise<void>(resolve => {
      resolveDone = resolve;
    });
    const job = { controller, done };
    this.jobs.set(owner, job);
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    let input: Awaited<ReturnType<typeof openSourceInput>> | undefined;
    let child: ReturnType<typeof spawn> | undefined;
    let timeline: FragmentedMp4Timeline | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let killTimeout: ReturnType<typeof setTimeout> | undefined;
    let preparationTimeout: ReturnType<typeof setTimeout> | undefined;
    let cleaning: Promise<void> | undefined;
    const cleanup = (): Promise<void> =>
      (cleaning ??= (async () => {
        signal.removeEventListener('abort', abort);
        if (expiry) clearTimeout(expiry);
        if (preparationTimeout) clearTimeout(preparationTimeout);
        timeline?.destroy();
        if (child && child.exitCode === null && child.signalCode === null) {
          const stopped = new Promise<void>(resolve => child!.once('close', () => resolve()));
          child.kill('SIGTERM');
          killTimeout = setTimeout(() => child?.kill('SIGKILL'), 2000);
          killTimeout.unref();
          // Wake blocked pipe/network I/O instead of waiting for the input timeout.
          child.stdout?.destroy();
          await input?.close();
          await stopped;
        }
        if (killTimeout) clearTimeout(killTimeout);
        if (child) this.processes.delete(child);
        await input?.close();
        if (this.jobs.get(owner) === job) this.jobs.delete(owner);
        resolveDone();
      })());
    try {
      await previous?.done;
      if (controller.signal.aborted)
        throw new AudioPlaybackError('Audio preparation was cancelled.');
      if (this.closed || this.jobs.size > 2 || this.processes.size >= 4) {
        throw new AudioPlaybackError('Audio conversion is busy. Retry shortly.');
      }
      input = await openSourceInput(this.mediaLoad, {
        ...target,
        durationSeconds: delivery.durationSeconds,
      });
      if (controller.signal.aborted)
        throw new AudioPlaybackError('Audio preparation was cancelled.');
      const spawnStartedAt = performance.now();
      child = spawn(
        'ffmpeg',
        audioConversionArgs(
          input.url,
          startSeconds,
          selectedAudioTrack,
          copyAudio,
          delivery.transcodeVideo ? 'transcode' : delivery.videoCodec === 'hevc' ? 'hevc' : 'copy'
        ),
        {
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      this.processes.add(child);
      child.stderr!.resume();
      controller.signal.addEventListener(
        'abort',
        () => {
          void cleanup();
        },
        { once: true }
      );
      expiry = setTimeout(abort, Math.max(1, expiresAt.getTime() - Date.now()));
      expiry.unref();
      const running = child;
      const exited = new Promise<number | null>(resolve =>
        running.once('close', code => resolve(code))
      );
      // Do not send a 200 response until the muxer has produced a usable output header.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new AudioPlaybackError(
              'Audio conversion timed out waiting for source data. Retry playback.'
            )
          );
          abort();
        }, 45_000);
        const finish = (error?: Error) => {
          clearTimeout(timeout);
          running.stdout!.removeListener('readable', readable);
          running.removeListener('error', failed);
          running.removeListener('close', closed);
          controller.signal.removeEventListener('abort', cancelled);
          if (error) reject(error);
          else resolve();
        };
        const readable = () => {
          logger.debug('AudioPlaybackService', 'FFmpeg produced its first output', {
            sourceId: target.source.id,
            elapsedMs: Math.round(performance.now() - spawnStartedAt),
            copyAudio,
            transcodeVideo: delivery.transcodeVideo === true,
          });
          finish();
        };
        const failed = () =>
          finish(new AudioPlaybackError('FFmpeg is unavailable. Install FFmpeg on the backend.'));
        const closed = () =>
          finish(
            new AudioPlaybackError('The source audio could not be converted. Retry playback.')
          );
        const cancelled = () => finish(new AudioPlaybackError('Audio preparation was cancelled.'));
        running.stdout!.once('readable', readable);
        running.once('error', failed);
        running.once('close', closed);
        controller.signal.addEventListener('abort', cancelled, { once: true });
      });
      timeline = new FragmentedMp4Timeline();
      preparationTimeout = setTimeout(abort, 45_000);
      preparationTimeout.unref();
      // Consume errors even if initialization fails before the response is returned.
      timeline.on('error', () => abort());
      running.stdout!.pipe(timeline);
      const timestampOffset = await timeline.initialized;
      clearTimeout(preparationTimeout);
      const iterator = timeline[Symbol.asyncIterator]();
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        async pull(output) {
          try {
            const next = await iterator.next();
            if (cancelled) return;
            if (next.done) {
              const code = await exited;
              if (code !== 0 || controller.signal.aborted)
                throw new Error('Audio conversion stopped before completion.');
              output.close();
              await cleanup();
            } else output.enqueue(next.value);
          } catch (error) {
            if (!cancelled) output.error(error);
            await cleanup();
          }
        },
        async cancel() {
          cancelled = true;
          abort();
          await cleanup();
          await iterator.return?.().catch(() => undefined);
        },
      });
      return new Response(body, {
        headers: {
          'Content-Type': 'video/mp4',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Playback-Timestamp-Offset': String(timestampOffset),
          'Access-Control-Expose-Headers': 'X-Playback-Timestamp-Offset',
        },
      });
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.jobs.values()) job.controller.abort();
    for (const child of this.processes) child.kill('SIGKILL');
    await Promise.all([...this.jobs.values()].map(job => job.done));
    this.probes.clear();
  }
}
