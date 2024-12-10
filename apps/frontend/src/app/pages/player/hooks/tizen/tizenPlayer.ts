import {
  Player,
  PlayerEvents,
  PlayerLanguage,
  PlayerStatus,
  Track,
} from '../playerClassAbstract';
import {
  AudioTrackExtraInfo,
  AVPlayListeners,
  TextTrackExtraInfo,
  TrackInfo,
} from '../../../../../tizen';

type Listeners = {
  [E in keyof PlayerEvents]: ((data: PlayerEvents[E]) => void)[];
};

// ToDo: extend it
const languageMap: Record<PlayerLanguage, RegExp> = {
  en: /^en$|^eng|^en-/i,
  es: /^es$|^spa|^es-|^esa/i,
  it: /^it$|^ita|^it-/i,
  de: /^de$|^ger|^de-/i,
  fr: /^fr$|^fra|^fr-/i,
  lt: /^lt$|^lit|^lt-/i,
};

export class TizenPlayer implements Player {
  private videoDuration = 0;
  private currentTime = 0;
  private currentSubtitle = '';
  private subtitlesEnabled = true;
  private ready = false;
  private listeners: Listeners = {
    length: [],
    currentTime: [],
    status: [],
    subtitle: [],
    error: [],
    ready: [],
  };

  private static standardizeLanguage(
    rawLanguage: string
  ): PlayerLanguage | null {
    // Possible values: en, eng, english
    for (const [language, regex] of Object.entries(languageMap)) {
      if (regex.test(rawLanguage.trim())) {
        return language as PlayerLanguage;
      }
    }
    console.log(`Language not supported: "${rawLanguage}"`);
    return null;
  }
  private static getTrackLanguage(track: TrackInfo) {
    if (track.type === 'AUDIO') {
      try {
        const trackInfo = JSON.parse(
          track.extra_info
        ) satisfies AudioTrackExtraInfo;
        return TizenPlayer.standardizeLanguage(trackInfo.language);
      } catch {
        //
      }
    }
    if (track.type === 'TEXT') {
      try {
        const trackInfo = JSON.parse(
          track.extra_info
        ) satisfies TextTrackExtraInfo;
        return TizenPlayer.standardizeLanguage(trackInfo.track_lang);
      } catch {
        //
      }
    }
    const match = track.extra_info.match(/"\w*lang[^"]*"\s*:\s*"([^"]*)"/);
    if (match) {
      return TizenPlayer.standardizeLanguage(match[1]);
    }
    return null;
  }

  private is4KSupported() {
    try {
      return window.webapis.productinfo.isUdPanelSupported();
    } catch {
      return false;
    }
  }
  private set4K() {
    if (this.is4KSupported()) {
      try {
        window.webapis.avplay.setStreamingProperty('SET_MODE_4K', 'true');
        return true;
      } catch {
        //
      }
    }
    return false;
  }

  private is8KSupported() {
    try {
      return window.webapis.productinfo.is8KPanelSupported();
    } catch {
      return false;
    }
  }
  private set8K() {
    if (this.is8KSupported()) {
      try {
        window.webapis.avplay.setStreamingProperty(
          'ADAPTIVE_INFO',
          'FIXED_MAX_RESOLUTION=7680x4320'
        );
        return true;
      } catch {
        //
      }
    }
    return false;
  }

  private setTrack(type: 'AUDIO' | 'TEXT', index: number) {
    try {
      window.webapis.avplay.setSelectTrack(type, index);
      return true;
    } catch (error) {
      this.onError(error);
      return false;
    }
  }
  private getTracks(type: 'AUDIO' | 'TEXT'): Track[] {
    try {
      const tracks = window.webapis.avplay
        .getTotalTrackInfo()
        .filter((track) => track.type === type);
      return tracks.map((track) => ({
        index: track.index,
        language: TizenPlayer.getTrackLanguage(track),
      }));
    } catch (error) {
      this.onError(error);
    }

    return [];
  }

  private getResolution(): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      window.tizen.systeminfo.getPropertyValue(
        'DISPLAY',
        function successHandler(data) {
          resolve({
            width: data.resolutionWidth,
            height: data.resolutionHeight,
          });
        },
        function errorHandler() {
          resolve({ width: window.innerWidth, height: window.innerHeight });
        }
      );
    });
  }
  private getListeners(): Partial<AVPlayListeners> {
    return {
      oncurrentplaytime: this.updateTime,
      onstreamcompleted: this.stop,
      onsubtitlechange: (_duration: number, text: string) => {
        this.updateSubtitle(text);
      },
    };
  }

  private setSubtitlesEnabled(enabled: boolean): boolean {
    this.subtitlesEnabled = enabled;
    if (
      window.webapis.avplay.setSilentSubtitle(!this.subtitlesEnabled) ===
      'success'
    ) {
      this.updateSubtitle('');
      return true;
    }
    return false;
  }

  private updateDuration = () => {
    const duration = window.webapis.avplay.getDuration();
    if (duration !== this.videoDuration) {
      this.videoDuration = duration;
      this.listeners.length.forEach((cb) => cb(duration));
    }
  };
  private updateTime = (currentTime: number) => {
    if (this.currentTime !== currentTime) {
      this.currentTime = currentTime;
      this.listeners.currentTime.forEach((cb) => cb(currentTime));
    }
  };

  private updateSubtitle(text: string) {
    if (this.currentSubtitle !== text) {
      this.currentSubtitle = text;
      this.listeners.subtitle.forEach((cb) => cb(text));
    }
  }
  private onError = (error: unknown) => {
    console.error(error);
    if (error instanceof Error) {
      this.listeners.error.forEach((cb) => cb(error));
    } else if (typeof error === 'string') {
      this.listeners.error.forEach((cb) => cb(new Error(error)));
    } else {
      this.listeners.error.forEach((cb) => cb(error));
    }
  };

  private onReady() {
    this.ready = true;
    this.listeners.ready.forEach((cb) => cb());
  }
  private getState() {
    return window.webapis.avplay.getState();
  }

  private updateState(state: PlayerStatus) {
    this.listeners.status.forEach((cb) => cb(state));
  }

  private prepare(): Promise<void> {
    return new Promise((resolve, reject) => {
      window.webapis.avplay.prepareAsync(resolve, reject);
    });
  }
  private prepareAndPlay() {
    window.webapis.avplay.prepareAsync(this.play, this.onError);
  }

  async init(url: string): Promise<boolean> {
    try {
      const { width, height } = await this.getResolution();

      if (this.getState() !== 'NONE') {
        this.close();
      }

      window.webapis.avplay.open(url);
      window.webapis.avplay.setDisplayRect(0, 0, width, height);
      window.webapis.avplay.setListener(this.getListeners());
      window.webapis.avplay.setDisplayMethod(
        'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO'
      );

      if (!this.set8K()) {
        this.set4K();
      }

      await this.prepare();
      this.updateDuration();
      this.onReady();

      return true;
    } catch (error) {
      this.onError(error);
      return false;
    }
  }

  pause = (): boolean => {
    const playerState = this.getState();

    if (playerState === 'PLAYING' || playerState === 'READY') {
      if (window.webapis.avplay.pause() !== 'success') {
        return false;
      }
      this.updateState('PAUSED');
    }
    return true;
  };
  play = (): boolean => {
    try {
      switch (this.getState()) {
        case 'IDLE':
        case 'NONE':
          this.prepareAndPlay();
          return true;
        case 'READY':
        case 'PAUSED':
          if (window.webapis.avplay.play() !== 'success') {
            return false;
          }
          this.updateState('PLAYING');
          return true;
        default:
          console.warn('Unhandled player state');
          break;
      }
    } catch (error: unknown) {
      this.onError(error);
    }
    return false;
  };
  stop = (): boolean => {
    const playerState = this.getState();

    if (playerState === 'PLAYING' || playerState === 'PAUSED') {
      if (window.webapis.avplay.stop() !== 'success') {
        return false;
      }
      this.updateTime(0);
    }

    this.updateSubtitle('');
    this.updateState('IDLE');
    return true;
  };
  fastForward = (ms: number): boolean => {
    const newTime = this.currentTime + ms;

    if (newTime > this.videoDuration) {
      return false;
    }

    try {
      if (window.webapis.avplay.jumpForward(ms) === 'success') {
        this.updateTime(newTime);
        return true;
      }
    } catch (error: unknown) {
      this.onError(error);
    }
    return false;
  };
  rewind = (ms: number): boolean => {
    const newTime = this.currentTime - ms;

    if (newTime < 0) {
      return false;
    }

    try {
      if (window.webapis.avplay.jumpBackward(ms) === 'success') {
        this.updateTime(newTime);
        return true;
      }
    } catch (error: unknown) {
      this.onError(error);
    }
    return false;
  };
  videoLength = (): number => {
    return this.videoDuration;
  };
  seekTo = (time: number): boolean => {
    return window.webapis.avplay.seekTo(time) === 'success';
  };
  played = (): number => {
    return this.currentTime;
  };
  togglePlay = (): boolean => {
    if (this.getState() === 'PLAYING') {
      return this.pause();
    }
    return this.play();
  };
  close = (): boolean => {
    this.ready = false;
    this.updateState('NONE');
    return window.webapis.avplay.close() === 'success';
  };
  getAudioTracks = (): Track[] => {
    return this.getTracks('AUDIO');
  };
  getSubtitleTracks = (): Track[] => {
    return this.getTracks('TEXT');
  };
  setAudioTrack = (track: Track): boolean => {
    return this.setTrack('AUDIO', track.index);
  };
  setSubtitleTrack = (track: Track): boolean => {
    return this.setTrack('TEXT', track.index);
  };
  enableSubtitle = (): boolean => {
    return this.setSubtitlesEnabled(true);
  };
  disableSubtitle = (): boolean => {
    return this.setSubtitlesEnabled(false);
  };
  toggleSubtitle = (): boolean => {
    return this.setSubtitlesEnabled(!this.subtitlesEnabled);
  };
  setCustomSubtitle = (url: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      const subtitleFileName = 'subtitle' + new Date().getTime();
      const download = new window.tizen.DownloadRequest(
        url,
        'wgt-private-tmp',
        subtitleFileName
      );

      // Subtitles needs to be on device to get loaded
      window.tizen.download.start(download, {
        oncompleted: (_id, fullPath) => {
          window.tizen.filesystem.resolve(
            'wgt-private-tmp',
            (dir) => {
              try {
                const packageURI = dir.toURI().substring(7);
                // Setting subtitles for the stream
                resolve(
                  window.webapis.avplay.setExternalSubtitlePath(
                    packageURI + '/' + subtitleFileName + '.smi'
                  ) === 'success'
                );
              } catch {
                // On 2015 different format of the URI is needed
                const packageURI =
                  dir.toURI().replace('file://', '') +
                  '/' +
                  fullPath.split('/')[1];
                resolve(
                  window.webapis.avplay.setExternalSubtitlePath(packageURI) ===
                    'success'
                );
              }
            },
            (error) => {
              reject(error);
              this.onError(error);
            },
            'r'
          );
        },
      });
    });
  };

  isReady = (): boolean => {
    return this.ready;
  };

  on<T extends keyof PlayerEvents>(
    event: T,
    callback: (data: PlayerEvents[T]) => void
  ): () => void {
    this.listeners[event].push(callback);
    return () => {
      const listenerIndex = this.listeners[event].indexOf(callback);
      if (listenerIndex !== -1) {
        this.listeners[event].splice(listenerIndex, 1);
      }
    };
  }
}
