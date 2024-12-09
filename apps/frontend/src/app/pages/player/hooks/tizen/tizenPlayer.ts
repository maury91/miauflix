import { Player, PlayerEvents, Track } from '../playerClassAbstract';
import { AVPlayListeners } from '../../../../../tizen';

type Listeners = {
  [E in keyof PlayerEvents]: ((data: PlayerEvents[E]) => void)[];
};

export class TizenPlayer implements Player {
  private videoDuration = 0;
  private currentTime = 0;
  private currentSubtitle = '';
  private subtitlesEnabled = true; // ToDo: Make subtitles toggleable
  private listeners: Listeners = {
    length: [],
    currentTime: [],
    status: [],
    subtitle: [],
    error: [],
    ready: [],
  };

  private is4KSupported() {
    return window.webapis.productinfo.isUdPanelSupported();
  }

  private set4K() {
    if (this.is4KSupported()) {
      window.webapis.avplay.setStreamingProperty('SET_MODE_4K', 'true');
      return true;
    }
    return false;
  }

  private is8KSupported() {
    return window.webapis.productinfo.is8KPanelSupported();
  }

  private set8K() {
    if (this.is8KSupported()) {
      window.webapis.avplay.setStreamingProperty(
        'ADAPTIVE_INFO',
        'FIXED_MAX_RESOLUTION=7680x4320'
      );
      return true;
    }
    return false;
  }

  private setTrack(type: 'AUDIO' | 'VIDEO' | 'TEXT', index: number) {
    try {
      window.webapis.avplay.setSelectTrack(type, index);
      return true;
    } catch (error) {
      this.onError(error);
      return false;
    }
  }

  private getTracks(type: 'AUDIO' | 'VIDEO' | 'TEXT'): Track[] {
    try {
      const trackInfo = window.webapis.avplay.getTotalTrackInfo();
      const tracks = trackInfo.filter((track) => track.type === type);
      return tracks.map((track) => ({
        index: track.index,
        language: this.getTrackLanguage(track.extra_info),
      }));
    } catch (error) {
      this.onError(error);
    }

    return [];
  }

  private getTrackLanguage(extraInfo: string) {
    const match = extraInfo.match(/lang[^:]*:([^:]*)/);
    if (match) {
      return match[1];
    }
    return null;
  }

  private getResolution(): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
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

  private updateDuration() {
    const duration = window.webapis.avplay.getDuration();
    if (duration !== this.videoDuration) {
      this.videoDuration = duration;
      this.listeners.length.forEach((cb) => cb(duration));
    }
  }

  private updateTime(currentTime: number) {
    if (this.currentTime !== currentTime) {
      this.currentTime = currentTime;
      this.listeners.currentTime.forEach((cb) => cb(currentTime));
    }
  }

  private updateSubtitle(text: string) {
    if (this.currentSubtitle !== text) {
      this.currentSubtitle = text;
      this.listeners.subtitle.forEach((cb) => cb(text));
    }
  }

  private onError(error: unknown) {
    if (error instanceof Error) {
      this.listeners.error.forEach((cb) => cb(error));
    } else if (typeof error === 'string') {
      this.listeners.error.forEach((cb) => cb(new Error(error)));
    } else {
      this.listeners.error.forEach((cb) => cb(error));
    }
  }

  private onReady() {
    this.listeners.ready.forEach((cb) => cb());
  }

  private getListeners(): Partial<AVPlayListeners> {
    return {
      onbufferingcomplete: this.updateDuration,
      oncurrentplaytime: this.updateTime,
      onstreamcompleted: () => {
        this.stop();
      },
      onsubtitlechange: (_duration: number, text: string) => {
        this.updateSubtitle(text);
      },
    };
  }

  private getState() {
    return window.webapis.avplay.getState();
  }

  private updateState(state: 'PLAYING' | 'READY' | 'IDLE' | 'PAUSED') {
    this.listeners.status.forEach((cb) => cb(state));
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
      return true;
    } catch (error) {
      this.onError(error);
      return false;
    }
  }

  pause(): boolean {
    const playerState = this.getState();

    if (playerState === 'PLAYING' || playerState === 'READY') {
      if (window.webapis.avplay.pause() !== 'success') {
        return false;
      }
      this.updateState('PAUSED');
    }
    return true;
  }

  private prepareAndPlay() {
    window.webapis.avplay.prepareAsync(this.play, this.onError);
    this.onReady();
  }

  play(): boolean {
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
  }

  stop(): boolean {
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
  }

  fastForward(ms: number): boolean {
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
  }

  rewind(ms: number): boolean {
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
  }

  videoLength(): number {
    return this.videoDuration;
  }
  seekTo(time: number): boolean {
    return window.webapis.avplay.seekTo(time) === 'success';
  }
  played(): number {
    return this.currentTime;
  }
  togglePlay(): boolean {
    if (this.getState() === 'PLAYING') {
      return this.pause();
    }
    return this.play();
  }
  close(): boolean {
    return window.webapis.avplay.close() === 'success';
  }
  getVideoTracks(): Track[] {
    return this.getTracks('VIDEO');
  }
  getAudioTracks(): Track[] {
    return this.getTracks('AUDIO');
  }
  getSubtitleTracks(): Track[] {
    return this.getTracks('TEXT');
  }
  setVideoTrack(track: Track): boolean {
    return this.setTrack('VIDEO', track.index);
  }
  setAudioTrack(track: Track): boolean {
    return this.setTrack('AUDIO', track.index);
  }
  setSubtitleTrack(track: Track): boolean {
    return this.setTrack('TEXT', track.index);
  }
  enableSubtitle(): boolean {
    return this.setSubtitlesEnabled(true);
  }
  disableSubtitle(): boolean {
    return this.setSubtitlesEnabled(false);
  }
  toggleSubtitle(): boolean {
    return this.setSubtitlesEnabled(!this.subtitlesEnabled);
  }
  setCustomSubtitle(url: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const subtitleFileName = 'subtitle' + new Date().getTime();
      const download = new window.tizen.DownloadRequest(
        url,
        'wgt-private-tmp',
        subtitleFileName
      );

      // Subtitles needs to be on device to get loaded
      window.tizen.download.start(download, {
        oncompleted: (id, fullPath) => {
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
              } catch (e) {
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
            this.onError,
            'r'
          );
        },
      });
    });
  }

  on<T extends keyof PlayerEvents>(
    event: T,
    callback: (data: PlayerEvents[T]) => void
  ): void {
    this.listeners[event].push(callback);
  }
}
