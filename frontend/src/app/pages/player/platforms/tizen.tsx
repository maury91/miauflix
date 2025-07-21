import styled from 'styled-components';
import { PlaybackSpeed, Player, PlayerLanguage, PlayerStatus, Track } from '../playerClassAbstract';
import { AudioTrackExtraInfo, AVPlayListeners, TextTrackExtraInfo, TrackInfo } from '@/tizen';
import { createRef } from 'react';

// ToDo: extend it
const languageMap: Record<PlayerLanguage, RegExp> = {
  en: /^en$|^eng|^en-/i,
  es: /^es$|^spa|^es-|^esa/i,
  it: /^it$|^ita|^it-/i,
  de: /^de$|^ger|^de-/i,
  fr: /^fr$|^fra|^fr-/i,
  lt: /^lt$|^lit|^lt-/i,
};

export const TizenPlayerContainer = styled.object`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10000;
`;

export class TizenPlayer extends Player {
  private videoDuration = 0;
  private currentTime = 0;
  private currentSubtitle = '';
  private currentSubtitleCueEndsAt = 0;
  private subtitlesEnabled = true;
  private ready = false;
  private containerRef = createRef<HTMLObjectElement>();

  public container = (
    <TizenPlayerContainer type={'application/avplayer'} ref={this.containerRef} />
  );

  constructor() {
    super();
    setInterval(this.updateTime, 500);
  }

  private static standardizeLanguage(rawLanguage: string): PlayerLanguage | null {
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
        const trackInfo = JSON.parse(track.extra_info) satisfies AudioTrackExtraInfo;
        return TizenPlayer.standardizeLanguage(trackInfo.language);
      } catch {
        //
      }
    }
    if (track.type === 'TEXT') {
      try {
        const trackInfo = JSON.parse(track.extra_info) satisfies TextTrackExtraInfo;
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
      console.log('is4KSupported');
      return window.webapis.productinfo.isUdPanelSupported();
    } catch {
      return false;
    }
  }
  private set4K() {
    if (this.is4KSupported()) {
      try {
        console.log('set4K');
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
      console.log('is8KSupported');
      return window.webapis.productinfo.is8KPanelSupported();
    } catch {
      return false;
    }
  }
  private set8K() {
    if (this.is8KSupported()) {
      try {
        console.log('set8K');
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
      console.log('setTrack', type, index);
      window.webapis.avplay.setSelectTrack(type, index);
      return true;
    } catch (error) {
      this.onError(error);
      return false;
    }
  }
  private getTracks(type: 'AUDIO' | 'TEXT'): Track[] {
    try {
      console.log('getTracks', type);
      const tracks = window.webapis.avplay.getTotalTrackInfo().filter(track => track.type === type);
      return tracks.map(track => ({
        index: track.index,
        language: TizenPlayer.getTrackLanguage(track),
      }));
    } catch (error) {
      this.onError(error);
    }

    return [];
  }

  private getResolution(): Promise<{ width: number; height: number }> {
    return new Promise(resolve => {
      console.log('getResolution');
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
      // oncurrentplaytime: this.updateTime,
      onstreamcompleted: () => {
        console.log('Stream completed');
        if (this.currentTime < this.videoDuration * 0.9) {
          setTimeout(this.reload, 200);
        } else {
          this.stop();
        }
      },
      onsubtitlechange: (duration: number, text: string) => {
        this.currentSubtitleCueEndsAt = this.currentTime + duration;
        this.updateSubtitle(text);
      },
    };
  }

  private setSubtitlesEnabled(enabled: boolean): boolean {
    this.subtitlesEnabled = enabled;
    console.log('setSilentSubtitle', !this.subtitlesEnabled);
    if (window.webapis.avplay.setSilentSubtitle(!this.subtitlesEnabled) === 'success') {
      this.updateSubtitle('');
      return true;
    }
    return false;
  }

  private updateDuration = () => {
    console.log('getDuration');
    const duration = window.webapis.avplay.getDuration();
    if (duration !== this.videoDuration) {
      this.videoDuration = duration;
      this.emit('length', duration);
    }
  };
  private updateTime = () => {
    const currentTime = window.webapis.avplay.getCurrentTime();
    if (this.currentTime !== currentTime) {
      this.currentTime = currentTime;
      this.emit('currentTime', currentTime);
      if (this.currentSubtitleCueEndsAt < currentTime) {
        this.updateSubtitle('');
      }
    }
  };
  private updateSubtitle(text: string) {
    if (this.currentSubtitle !== text) {
      this.currentSubtitle = text;
      this.emit('subtitle', text);
    }
  }

  private reload = () => {
    if (window.webapis.avplay.suspend() === 'success') {
      window.webapis.avplay.restore();
    }
  };

  private onError = (error: unknown) => {
    console.error(error);
    if (error instanceof Error) {
      this.emit('error', error);
    } else if (typeof error === 'string') {
      this.emit('error', new Error(error));
    } else {
      this.emit('error', error);
    }
  };

  private onReady() {
    this.ready = true;
    this.emit('ready', undefined);
  }
  private getState() {
    console.log('getState');
    return window.webapis.avplay.getState();
  }

  private updateState(state: PlayerStatus) {
    this.emit('status', state);
  }

  private prepare(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('prepareAsync');
      window.webapis.avplay.prepareAsync(resolve, reject);
    });
  }
  private prepareAndPlay() {
    console.log('prepareAndPlay');
    window.webapis.avplay.prepareAsync(this.play, this.onError);
  }

  async init(url: string): Promise<boolean> {
    try {
      console.log('TizenPlayer.init', url);
      const { width, height } = await this.getResolution();

      if (this.getState() !== 'NONE') {
        this.close();
      }

      console.log('open', url);
      window.webapis.avplay.open(url);
      console.log('setDisplayRect', width, height);
      window.webapis.avplay.setDisplayRect(0, 0, width, height);
      console.log('setListeners');
      window.webapis.avplay.setListener(this.getListeners());
      console.log('setDisplayMethod');
      window.webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO');

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
      console.log('pause');
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
          console.log('play');
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
      console.log('stop');
      if (window.webapis.avplay.stop() !== 'success') {
        return false;
      }
      this.updateTime();
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
      console.log('fastForward', ms);
      if (window.webapis.avplay.jumpForward(ms) === 'success') {
        this.updateTime();
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
      console.log('rewind', ms);
      if (window.webapis.avplay.jumpBackward(ms) === 'success') {
        this.updateTime();
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
  setSpeed = (speed: PlaybackSpeed): boolean => {
    try {
      console.log('Settings speed', speed);
      window.webapis.avplay.setSpeed(speed);
      return true;
    } catch {
      return false;
    }
  };
  seekTo = (time: number): boolean => {
    console.log('seekTo', Math.floor(time), this.getState());
    window.webapis.avplay.seekTo(Math.floor(time));
    return true;
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
    console.log('close');
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
      const download = new window.tizen.DownloadRequest(url, 'wgt-private-tmp', subtitleFileName);

      // Subtitles needs to be on device to get loaded
      window.tizen.download.start(download, {
        oncompleted: (_id, fullPath) => {
          window.tizen.filesystem.resolve(
            'wgt-private-tmp',
            dir => {
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
                  dir.toURI().replace('file://', '') + '/' + fullPath.split('/')[1];
                resolve(window.webapis.avplay.setExternalSubtitlePath(packageURI) === 'success');
              }
            },
            error => {
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
}
