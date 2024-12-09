export interface Track {
  index: number;
  language: string | null;
}
export interface PlayerEvents {
  length: number;
  currentTime: number;
  status: 'PLAYING' | 'READY' | 'IDLE' | 'PAUSED';
  subtitle: string;
  error: Error | unknown;
  ready: void;
}

export abstract class Player {
  abstract on<T extends keyof PlayerEvents>(
    event: T,
    callback: (data: PlayerEvents[T]) => void
  ): void;
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
  abstract getVideoTracks(): Track[];
  abstract getAudioTracks(): Track[];
  abstract getSubtitleTracks(): Track[];
  abstract setVideoTrack(track: Track): boolean;
  abstract setAudioTrack(track: Track): boolean;
  abstract setSubtitleTrack(track: Track): boolean;
  abstract enableSubtitle(): boolean;
  abstract disableSubtitle(): boolean;
  abstract toggleSubtitle(): boolean;
  abstract setCustomSubtitle(url: string): Promise<boolean>;
}
