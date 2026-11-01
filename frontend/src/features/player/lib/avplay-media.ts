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
 * What AVPlay decodes itself on 2020 and newer TVs, so the backend sends those files as they are
 * (Matroska and MP4, H.264 and H.265, every audio track) instead of converting them. Files with
 * other audio (DTS, TrueHD) still get converted audio, played in a `<video>` element.
 */
export const AVPLAY_CAPABILITIES = {
  allowHevc: true,
  nativeHevcContainers: ['mp4', 'matroska'],
  supportedAudioCodecs: ['aac', 'mp3', 'ac3', 'eac3', 'flac'],
  nativeAudioTracks: true,
} satisfies Partial<PlaybackPreferences>;

/** AVPlay places the video in a 1920x1080 space, whatever the app's resolution. */
const DISPLAY_WIDTH = 1920;
const DISPLAY_HEIGHT = 1080;
/** AVPlay reports the position about every 100 ms; `<video>` fires timeupdate every 250 ms. */
const TIME_UPDATE_INTERVAL_MS = 250;
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

  /** Open `url` and prepare it, shown in the area of `element`. */
  open(url: string, element: HTMLElement): void {
    this.close();
    const generation = ++this.generation;
    this.opened = true;
    this.parentElement = element.parentElement;
    try {
      this.avplay.open(url);
      this.avplay.setListener(this.listener(generation));
      this.place(element);
      this.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO');
      this.enable4K();
    } catch {
      this.emit('error');
      return;
    }
    this.emit('loadstart');
    this.avplay.prepareAsync(
      () => {
        if (generation !== this.generation) return;
        this.prepared = true;
        this.length = this.avplay.getDuration() / 1000;
        this.audioTracks = this.readAudioTracks();
        this.emit('durationchange');
        this.emit('loadedmetadata');
        this.emit('loadeddata');
        this.emit('canplay');
        if (this.pendingSeek !== null) this.currentTime = this.pendingSeek;
        this.pendingSeek = null;
        if (this.autoplay || !this.isPaused) this.start();
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
