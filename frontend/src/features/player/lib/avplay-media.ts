import type { PlaybackPreferences } from '@features/player/api/playback.api';

import type { AVPlay, AVPlayListeners, TrackInfo } from '@/types/tizen';

/**
 * What the player reads and drives on its media: a `<video>` element, or AVPlay, the Samsung TV's
 * native player. `HTMLVideoElement` already has this shape.
 */
export interface PlayerMedia {
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly readyState: number;
  autoplay: boolean;
  volume: number;
  muted: boolean;
  readonly parentElement: HTMLElement | null;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

/** AVPlay, when the app runs on a Samsung TV that loaded `webapis.js`. */
export function getAvplay(): AVPlay | undefined {
  return typeof window === 'undefined' ? undefined : window.webapis?.avplay;
}

/**
 * The average bitrate the TV is sent at most. The TV fetches a stream at about 11 Mbit/s, so a
 * 4K remux (~35 Mbit/s) froze on start and then played at a third of real time; this leaves room
 * for the peaks of variable-bitrate files.
 */
const TV_MAX_BITRATE_KBPS = 8_000;

/**
 * What AVPlay decodes itself on 2020 and newer TVs, so the backend sends those files as they are
 * (Matroska and MP4, H.264 and H.265, every audio track) instead of converting them. Files with
 * other audio (DTS, TrueHD) still get converted audio, played in a `<video>` element, unless the
 * TV reports the codec (see `reportedCodecs`). Converted audio is a last resort: the backend first
 * plays the file's TV remux (HLS with audio the TV decodes) when one is ready, then looks for
 * another source that plays as it is, and has a remux built while it converts.
 */
export const AVPLAY_CAPABILITIES = {
  allowHevc: true,
  nativeHevcContainers: ['mp4', 'matroska'],
  supportedAudioCodecs: ['aac', 'mp3', 'ac3', 'eac3', 'flac'],
  nativeAudioTracks: true,
  avoidAudioConversion: true,
  playsRemux: true,
  maxBitrateKbps: TV_MAX_BITRATE_KBPS,
} satisfies Partial<PlaybackPreferences>;

/**
 * The codec names `webapis.systeminfo` accepts, as Samsung documents them, with the ffprobe
 * `codec_name`s each covers: the backend only knows ffprobe's names. Images and 3D/360 variants
 * cover none.
 */
const TIZEN_AUDIO_CODECS: Record<string, string[]> = {
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
const TIZEN_VIDEO_CODECS: Record<string, string[]> = {
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

/**
 * Every codec the TV reports it decodes, in ffprobe names. Only Tizen 6.0 and newer can be
 * asked; older TVs (and a failing query) get undefined and keep the fixed list in
 * AVPLAY_CAPABILITIES.
 */
export function reportedCodecs(): { audio: string[]; video: string[] } | undefined {
  const systeminfo = typeof window === 'undefined' ? undefined : window.webapis?.systeminfo;
  const audioQuery = systeminfo?.isSupportedAudioCodec;
  const videoQuery = systeminfo?.isSupportedVideoCodec;
  if (!audioQuery || !videoQuery) return undefined;
  // `false` is a codec the TV does not decode. A name its firmware does not know throws (HEIC on
  // some): skipped. When every query of a kind throws, nothing is known, and an empty list would
  // turn away codecs the fixed list knows the TV plays: nothing is reported.
  const answered = { audio: false, video: false };
  const supported = (
    kind: keyof typeof answered,
    names: Record<string, string[]>,
    query: (codec: string) => boolean
  ) =>
    Object.keys(names).flatMap(codec => {
      try {
        const result = query.call(systeminfo, codec) === true;
        answered[kind] = true;
        return result ? names[codec] : [];
      } catch {
        return [];
      }
    });
  const audio = supported('audio', TIZEN_AUDIO_CODECS, audioQuery);
  const video = supported('video', TIZEN_VIDEO_CODECS, videoQuery);
  return answered.audio && answered.video
    ? { audio: [...new Set(audio)], video: [...new Set(video)] }
    : undefined;
}

/**
 * AVPlay's capabilities, with the codecs this TV reports when it can be asked. Reported audio
 * adds to the fixed list (AVPlay plays FLAC, which Samsung's list does not name); reported video
 * replaces the assumption that every H.264/H.265 file plays, and a TV without HEVC gets no H.265.
 */
export function avplayCapabilities(): Partial<PlaybackPreferences> {
  const codecs = reportedCodecs();
  if (!codecs) return AVPLAY_CAPABILITIES;
  return {
    ...AVPLAY_CAPABILITIES,
    supportedAudioCodecs: [
      ...new Set([...AVPLAY_CAPABILITIES.supportedAudioCodecs, ...codecs.audio]),
    ],
    supportedVideoCodecs: codecs.video,
    ...(codecs.video.includes('hevc') ? {} : { allowHevc: false, nativeHevcContainers: [] }),
  };
}

/** AVPlay places the video in a 1920x1080 space, whatever the app's resolution. */
const DISPLAY_WIDTH = 1920;
const DISPLAY_HEIGHT = 1080;
/** AVPlay reports the position about every 100 ms; `<video>` fires timeupdate every 250 ms. */
const TIME_UPDATE_INTERVAL_MS = 250;
/** A seek this close to where a file opened, as it prepares, is that same start. */
/** How much shorter than the file's length AVPlay's may be before it is taken as partial. */
const PARTIAL_LENGTH_SECONDS = 5;
const OPENED_AT_TOLERANCE_SECONDS = 1.5;
/** Seconds AVPlay buffers before it plays an HLS playlist (a TV version). */
const QUICK_START_SECONDS = 1;

const isHlsPlaylist = (url: string): boolean => /\.m3u8(?:\?|$)/.test(url);
/** AVPlay ends a stream that runs dry; before this share of the duration that is a stall. */
const EARLY_END_SHARE = 0.9;

/** One of the file's audio tracks; enabling it switches AVPlay to it. */
class AvplayAudioTrack {
  private selected = false;

  constructor(private readonly select: () => boolean) {}

  get enabled(): boolean {
    return this.selected;
  }

  set enabled(value: boolean) {
    if (!value) this.selected = false;
    else if (!this.selected) this.selected = this.select();
  }

  /** The selection did not happen after all: enabling the track tries it again. */
  reset(): void {
    this.selected = false;
  }
}

/**
 * AVPlay with the parts of the `<video>` element the player uses: state, the media events, and
 * `audioTracks`. AVPlay draws below the page, in the area of an `<object type="application/avplayer">`.
 */
export class AvplayMedia extends EventTarget implements PlayerMedia {
  autoplay = false;
  /** The remote sets the TV's volume; AVPlay has none of its own. */
  volume = 1;
  muted = false;
  parentElement: HTMLElement | null = null;
  audioTracks: AvplayAudioTrack[] = [];
  /** What AVPlay said about its last error (its event type, and message when it gave one). */
  errorDetail: string | null = null;

  private position = 0;
  private length = Number.NaN;
  private isPaused = true;
  private prepared = false;
  private opened = false;
  private seeking = false;
  private pendingSeek: number | null = null;
  /** Where the file was opened at, until it has prepared. */
  private startedAt: number | null = null;
  /** An audio track chosen while paused, selected when playback starts. */
  private pendingAudioTrack: { index: number; track: AvplayAudioTrack } | null = null;
  /** Seeks asked for since opening, so a late failure of the opening seek cannot undo them. */
  private seekRequests = 0;
  private lastTimeUpdate = 0;
  /** Bumped on every open and close, so callbacks of an earlier file are ignored. */
  private generation = 0;

  constructor(private readonly avplay: AVPlay) {
    super();
  }

  get currentTime(): number {
    return this.position;
  }

  set currentTime(seconds: number) {
    if (!Number.isFinite(seconds)) return;
    // Where it opened: as it prepares, a resume to the same place needs no seek.
    if (this.openedAt(seconds)) return;
    this.seekRequests += 1;
    // Moved elsewhere: a later seek back to where it opened is a seek like any other.
    this.startedAt = null;
    this.position = Math.max(0, seconds);
    if (!this.prepared) {
      this.pendingSeek = this.position;
      return;
    }
    const generation = this.generation;
    const done = (): void => {
      if (generation !== this.generation) return;
      this.seeking = false;
      this.emit('seeked');
      this.emit('timeupdate');
    };
    this.seeking = true;
    this.emit('seeking');
    try {
      this.avplay.seekTo(Math.floor(this.position * 1000), done, done);
    } catch {
      done();
    }
  }

  get duration(): number {
    return this.length;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  get readyState(): number {
    return this.prepared ? 4 : 0;
  }

  /**
   * Open `url` and prepare it, shown in the area of `element`. `durationSeconds` stands in for the
   * length AVPlay reports none of: an HLS playlist still being written plays as a live stream.
   * `startSeconds` is where it starts: AVPlay is seeked there before it prepares, so the first
   * picture it shows is that one, and no second seek is needed (on Tizen 5.5, a seek after
   * preparing showed the start of the segment first, and downloaded that segment again).
   */
  open(url: string, element: HTMLElement, durationSeconds?: number, startSeconds?: number): void {
    this.close();
    const generation = ++this.generation;
    this.opened = true;
    this.parentElement = element.parentElement;
    try {
      this.avplay.open(url);
      this.avplay.setListener(this.listener(generation));
      // Placed before preparing: moved there afterwards (to keep the display hidden until it
      // played), Tizen 5.5 plays the sound with a black picture.
      this.place(element);
      this.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO');
      this.enable4K();
      if (isHlsPlaylist(url)) this.startQuickly();
    } catch {
      this.emit('error');
      return;
    }
    // The opening seek, until AVPlay answers it; a prepare it turned away waits for that answer.
    let seekPending = false;
    let prepareAfterSeek = false;
    const seekSettled = (): void => {
      seekPending = false;
      if (!prepareAfterSeek || generation !== this.generation) return;
      prepareAfterSeek = false;
      prepare();
    };
    if (startSeconds !== undefined && startSeconds > 0) {
      // Prepared without waiting for the seek: Tizen 5.5 prepares at the seek's target that way
      // (and calls its success callback), which Samsung's reference does not promise. Firmware
      // that refuses to prepare during the seek prepares once it is answered (see `prepare`).
      let refusedOnce = false;
      const requestsAtOpen = this.seekRequests;
      const refused = (): void => {
        if (generation !== this.generation || refusedOnce) return;
        refusedOnce = true;
        this.startedAt = null;
        // A seek asked for since stands: going back to the start would undo it.
        if (this.seekRequests !== requestsAtOpen) return;
        // This AVPlay cannot seek before preparing: it seeks once prepared instead
        if (this.prepared) this.currentTime = startSeconds;
        else this.pendingSeek = startSeconds;
      };
      this.position = startSeconds;
      this.startedAt = startSeconds;
      seekPending = true;
      try {
        this.avplay.seekTo(Math.floor(startSeconds * 1000), seekSettled, () => {
          refused();
          seekSettled();
        });
      } catch {
        seekPending = false;
        refused();
      }
    }
    this.emit('loadstart');
    const prepare = (): void => {
      try {
        this.avplay.prepareAsync(prepared, failed);
      } catch {
        if (seekPending) prepareAfterSeek = true;
        else if (generation === this.generation) this.emit('error');
      }
    };
    const failed = (): void => {
      if (generation === this.generation) this.emit('error');
    };
    const prepared = (): void => {
      if (generation !== this.generation) return;
      this.prepared = true;
      const reported = this.avplay.getDuration() / 1000;
      const live = !(reported > 0);
      // A length short of the file's is only what is built so far (some firmware may report
      // it for a playlist still being written): the file's length stands, so a resume measured
      // against it lands where the viewer was.
      const partial =
        isHlsPlaylist(url) &&
        durationSeconds !== undefined &&
        reported < durationSeconds - PARTIAL_LENGTH_SECONDS;
      this.length = (live || partial) && durationSeconds ? durationSeconds : reported;
      this.audioTracks = this.readAudioTracks();
      this.emit('durationchange');
      this.emit('loadedmetadata');
      this.emit('loadeddata');
      this.emit('canplay');
      // A seek made before preparing, unless the events above (a resume) already seeked or it
      // opened there; a live playlist starts near its newest segment, so it is played from the
      // start instead.
      const pending = this.pendingSeek;
      const start = this.seeking
        ? null
        : pending !== null
          ? this.openedAt(pending)
            ? null
            : pending
          : live && this.startedAt === null
            ? 0
            : null;
      this.pendingSeek = null;
      if (start !== null) this.currentTime = start;
      this.startedAt = null;
      const play = (): void => {
        if (generation === this.generation && (this.autoplay || !this.isPaused)) this.start();
      };
      // Playing before the seek lands shows where AVPlay opened first: wait for it.
      if (this.seeking) this.addEventListener('seeked', play, { once: true });
      else play();
    };
    prepare();
  }

  play(): Promise<void> {
    if (this.isPaused) {
      this.isPaused = false;
      this.emit('play');
    }
    if (!this.prepared) return Promise.resolve();
    try {
      this.start();
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  pause(): void {
    if (this.isPaused) return;
    if (this.prepared) {
      try {
        this.avplay.pause();
      } catch {
        // AVPlay refuses to pause while it is still answering a seek (Tizen 5.5, "invalid
        // operation" in PLAYING): it pauses once the seek lands. Refused otherwise, it plays on,
        // and so does what this reports, or the next pause would think it has nothing to do.
        if (!this.seeking) return;
        const generation = this.generation;
        this.addEventListener(
          'seeked',
          () => {
            if (generation !== this.generation || !this.isPaused) return;
            try {
              this.avplay.pause();
            } catch {
              this.isPaused = false;
              this.emit('play');
            }
          },
          { once: true }
        );
      }
    }
    this.isPaused = true;
    this.emit('pause');
  }

  /** Release the TV's decoder while the app is in the background. */
  suspend(): void {
    if (this.opened) this.avplay.suspend();
  }

  restore(): void {
    if (this.opened) this.avplay.restore();
  }

  close(): void {
    this.generation += 1;
    if (!this.opened) return;
    this.opened = false;
    this.prepared = false;
    this.seeking = false;
    this.pendingSeek = null;
    this.startedAt = null;
    this.pendingAudioTrack = null;
    this.position = 0;
    this.length = Number.NaN;
    this.isPaused = true;
    this.audioTracks = [];
    try {
      this.avplay.stop();
    } catch {
      // Not playing yet
    }
    try {
      this.avplay.close();
    } catch {
      // Already closed
    }
    this.emit('emptied');
  }

  /** The file opened at `seconds`, give or take a keyframe, and has not finished preparing. */
  private openedAt(seconds: number): boolean {
    return (
      this.startedAt !== null && Math.abs(seconds - this.startedAt) < OPENED_AT_TOLERANCE_SECONDS
    );
  }

  private start(): void {
    this.avplay.play();
    const audioTrack = this.pendingAudioTrack;
    this.pendingAudioTrack = null;
    // Turned off again while paused: nothing is left to select.
    if (audioTrack !== null && audioTrack.track.enabled) {
      try {
        this.avplay.setSelectTrack('AUDIO', audioTrack.index);
      } catch {
        // AVPlay kept its track: the one asked for is not selected, and can be asked for again
        audioTrack.track.reset();
      }
    }
    if (this.isPaused) {
      this.isPaused = false;
      this.emit('play');
    }
    this.emit('playing');
  }

  private emit(type: string): void {
    this.dispatchEvent(new Event(type));
  }

  private listener(generation: number): AVPlayListeners {
    const current = (): boolean => generation === this.generation;
    return {
      onbufferingstart: () => {
        if (current()) this.emit('waiting');
      },
      onbufferingcomplete: () => {
        if (current() && !this.isPaused) this.emit('playing');
      },
      oncurrentplaytime: (milliseconds: number) => {
        // While seeking AVPlay still reports the old position
        if (!current() || this.seeking) return;
        this.position = milliseconds / 1000;
        const now = Date.now();
        if (now - this.lastTimeUpdate < TIME_UPDATE_INTERVAL_MS) return;
        this.lastTimeUpdate = now;
        this.emit('timeupdate');
      },
      onstreamcompleted: () => {
        if (!current()) return;
        if (this.position < this.length * EARLY_END_SHARE) {
          // The source ran out of downloaded data: reload and carry on from here
          try {
            this.avplay.suspend();
            this.avplay.restore();
            return;
          } catch {
            // Treat it as the end
          }
        }
        this.position = this.length;
        this.emit('timeupdate');
        if (!this.isPaused) {
          this.isPaused = true;
          this.emit('pause');
        }
        this.emit('ended');
      },
      onerrormsg: (eventType: string, eventMsg: string) => {
        if (current()) this.errorDetail = `${eventType}: ${eventMsg}`;
      },
      onerror: (eventType: string) => {
        if (!current()) return;
        if (!this.errorDetail?.startsWith(eventType)) this.errorDetail = eventType;
        this.emit('error');
      },
    };
  }

  private place(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !window.innerWidth || !window.innerHeight) {
      this.avplay.setDisplayRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
      return;
    }
    const x = DISPLAY_WIDTH / window.innerWidth;
    const y = DISPLAY_HEIGHT / window.innerHeight;
    this.avplay.setDisplayRect(
      Math.round(rect.left * x),
      Math.round(rect.top * y),
      Math.round(rect.width * x),
      Math.round(rect.height * y)
    );
  }

  /**
   * Play a TV version once a second is buffered, before and after a seek. By default AVPlay waits
   * for three of its 6-second segments (about 15 MB) first: on Tizen 5.5, over a link that brings
   * a segment in 1.5 s, this took the start plus a seek from 6.8 s to 3 s. Only for HLS, whose
   * segments are already stored: a torrent stream needs the default margin against starving.
   */
  private startQuickly(): void {
    try {
      this.avplay.setBufferingParam?.(
        'PLAYER_BUFFER_FOR_PLAY',
        'PLAYER_BUFFER_SIZE_IN_SECOND',
        QUICK_START_SECONDS
      );
      this.avplay.setBufferingParam?.(
        'PLAYER_BUFFER_FOR_RESUME',
        'PLAYER_BUFFER_SIZE_IN_SECOND',
        QUICK_START_SECONDS
      );
    } catch {
      // An older AVPlay buffers as it always did
    }
  }

  private enable4K(): void {
    try {
      if (window.webapis?.productinfo?.isUdPanelSupported()) {
        this.avplay.setStreamingProperty('SET_MODE_4K', 'TRUE');
      }
    } catch {
      // Not a UHD panel, or no productinfo privilege: AVPlay stays in its default mode
    }
  }

  private readAudioTracks(): AvplayAudioTrack[] {
    try {
      return this.avplay
        .getTotalTrackInfo()
        .filter((track: TrackInfo) => track.type === 'AUDIO')
        .map((track: TrackInfo) => {
          const wrapper: AvplayAudioTrack = new AvplayAudioTrack(() => {
            try {
              this.avplay.setSelectTrack('AUDIO', track.index);
              this.pendingAudioTrack = null;
              return true;
            } catch {
              // AVPlay switches audio only while playing: a paused player switches on play.
              if (!this.isPaused) return false;
              this.pendingAudioTrack = { index: track.index, track: wrapper };
              return true;
            }
          });
          return wrapper;
        });
    } catch {
      return [];
    }
  }
}
