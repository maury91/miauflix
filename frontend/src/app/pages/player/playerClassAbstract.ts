import type { ReactNode } from 'react';

export type PlayerLanguage = 'en' | 'es' | 'it' | 'de' | 'fr' | 'lt'; // Add more languages in the future
export interface Track {
  index: number;
  language: PlayerLanguage | null;
}

export type PlayerStatus = 'NONE' | 'PLAYING' | 'READY' | 'IDLE' | 'PAUSED';

export type Listeners = {
  [E in keyof PlayerEvents]: ((data: PlayerEvents[E]) => void)[];
};

export interface PlayerEvents {
  length: number;
  currentTime: number;
  status: PlayerStatus;
  subtitle: string;
  error: Error | unknown;
  ready: void;
}

export type PlaybackSpeed = -8 | -4 | -2 | 1 | 2 | 4 | 8;

export abstract class Player {
  public abstract container: ReactNode;
  protected listeners: Listeners = {
    length: [],
    currentTime: [],
    status: [],
    subtitle: [],
    error: [],
    ready: [],
  };

  protected emit<T extends keyof PlayerEvents>(event: T, data: PlayerEvents[T]): void {
    this.listeners[event].forEach(listener => listener(data));
  }

  abstract init(url: string): Promise<boolean>;
  abstract pause(): boolean;
  abstract play(): boolean;
  abstract stop(): boolean;
  abstract togglePlay(): boolean;
  abstract fastForward(ms: number): boolean;
  abstract rewind(ms: number): boolean;
  abstract videoLength(): number;
  abstract seekTo(time: number): boolean;
  abstract setSpeed(speed: PlaybackSpeed): boolean;
  abstract played(): number;
  abstract close(): boolean;
  abstract getAudioTracks(): Track[];
  abstract getSubtitleTracks(): Track[];
  abstract setAudioTrack(track: Track): boolean;
  abstract setSubtitleTrack(track: Track): boolean;
  abstract enableSubtitle(): boolean;
  abstract disableSubtitle(): boolean;
  abstract toggleSubtitle(): boolean;
  abstract setCustomSubtitle(url: string): Promise<boolean>;
  abstract isReady(): boolean;

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
