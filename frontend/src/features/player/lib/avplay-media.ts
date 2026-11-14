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
 * TV reports the codec (see `tizenCodecs`). Converted audio is a last resort: the backend first
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

/** The codec names `webapis.systeminfo` accepts, as Samsung documents them. */
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

/**
 * Every codec the TV reports it decodes, for the backend to match against the file. Only Tizen
 * 6.0 and newer can be asked; older TVs (and a failing query) send nothing and keep the fixed
 * list in AVPLAY_CAPABILITIES.
 */
export function tizenCodecs(): PlaybackPreferences['tizenCodecs'] {
  const systeminfo = typeof window === 'undefined' ? undefined : window.webapis?.systeminfo;
  const audioQuery = systeminfo?.isSupportedAudioCodec;
  const videoQuery = systeminfo?.isSupportedVideoCodec;
  if (!audioQuery || !videoQuery) return undefined;
  const supported = (query: (codec: string) => boolean, codec: string) => {
    try {
      return query.call(systeminfo, codec) === true;
    } catch {
      return false;
    }
  };
  return {
    audio: TIZEN_AUDIO_CODECS.filter(codec => supported(audioQuery, codec)),
    video: TIZEN_VIDEO_CODECS.filter(codec => supported(videoQuery, codec)),
  };
}

/** AVPlay's capabilities, with the codecs this TV reports when it can be asked. */
export function avplayCapabilities(): Partial<PlaybackPreferences> {
  const codecs = tizenCodecs();
  return codecs ? { ...AVPLAY_CAPABILITIES, tizenCodecs: codecs } : AVPLAY_CAPABILITIES;
}

/** AVPlay places the video in a 1920x1080 space, whatever the app's resolution. */
const DISPLAY_WIDTH = 1920;
const DISPLAY_HEIGHT = 1080;
/** AVPlay reports the position about every 100 ms; `<video>` fires timeupdate every 250 ms. */
const TIME_UPDATE_INTERVAL_MS = 250;
/** A seek this close to where a file opened, as it prepares, is that same start. */
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

  private position = 0;
  private length = Number.NaN;
  private isPaused = true;
  private prepared = false;
  private opened = false;
  private seeking = false;
  private pendingSeek: number | null = null;
  /** Where the file was opened at, until it has prepared. */
  private startedAt: number | null = null;
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
    if (startSeconds !== undefined && startSeconds > 0) {
      try {
        this.avplay.seekTo(Math.floor(startSeconds * 1000));
        this.position = startSeconds;
        this.startedAt = startSeconds;
      } catch {
        // This AVPlay cannot seek before preparing: it seeks once prepared instead
        this.pendingSeek = startSeconds;
      }
    }
    this.emit('loadstart');
    this.avplay.prepareAsync(
      () => {
        if (generation !== this.generation) return;
        this.prepared = true;
        const reported = this.avplay.getDuration() / 1000;
        const live = !(reported > 0);
        this.length = live && durationSeconds ? durationSeconds : reported;
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
      },
      () => {
        if (generation === this.generation) this.emit('error');
      }
    );
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
    this.isPaused = true;
    if (this.prepared) this.avplay.pause();
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
      onerror: () => {
        if (current()) this.emit('error');
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
        .map(
          (track: TrackInfo) =>
            new AvplayAudioTrack(() => {
              try {
                this.avplay.setSelectTrack('AUDIO', track.index);
                return true;
              } catch {
                return false;
              }
            })
        );
    } catch {
      return [];
    }
  }
}
