export type PlayerLanguage = 'en' | 'es' | 'it' | 'de' | 'fr' | 'lt'; // Add more languages in the future
export interface Track {
  index: number;
  language: PlayerLanguage | null;
}

export type PlayerStatus = 'NONE' | 'PLAYING' | 'READY' | 'IDLE' | 'PAUSED';

export interface PlayerEvents {
  length: number;
  currentTime: number;
  status: PlayerStatus;
  subtitle: string;
  error: Error | unknown;
  ready: void;
}

export abstract class Player {
  abstract on<T extends keyof PlayerEvents>(
    event: T,
    callback: (data: PlayerEvents[T]) => void
  ): () => void;
  abstract init(url: string): Promise<boolean>;
  abstract pause(): boolean;
  abstract play(): boolean;
  abstract stop(): boolean;
  abstract togglePlay(): boolean;
  abstract fastForward(ms: number): boolean;
  abstract rewind(ms: number): boolean;
  abstract videoLength(): number;
  abstract seekTo(time: number): boolean;
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
}
