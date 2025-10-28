export interface TrackInfo {
  extra_info: string;
  index: number;
  type: 'AUDIO' | 'VIDEO' | 'TEXT';
}

export interface VideoTrackExtraInfo {
  fourCC: string;
  Width: number;
  height: number;
  Bit_rate: number;
}

export interface AudioTrackExtraInfo {
  fourCC: string;
  language: string;
  channels: number;
  sample_rate: number;
  bit_rate: number;
}

export interface TextTrackExtraInfo {
  fourCC: string;
  track_num: number;
  track_lang: string;
  subtitle_type: string;
}

export type TVInputDeviceKeyName =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'VolumeUp'
  | 'VolumeDown'
  | 'VolumeMute'
  | 'ChannelUp'
  | 'ChannelDown'
  | 'ColorF0Red'
  | 'ColorF1Green'
  | 'ColorF2Yellow'
  | 'ColorF3Blue'
  | 'Menu'
  | 'Tools'
  | 'Info'
  | 'Exit'
  | 'Search'
  | 'Guide'
  | 'MediaRewind'
  | 'MediaPause'
  | 'MediaFastForward'
  | 'MediaRecord'
  | 'MediaPlay'
  | 'MediaStop'
  | 'MediaPlayPause'
  | 'MediaTrackPrevious'
  | 'MediaTrackNext'
  | 'Source'
  | 'PictureSize'
  | 'PreviousChannel'
  | 'ChannelList'
  | 'E-Manual'
  | 'MTS'
  | '3D'
  | 'Soccer'
  | 'Caption'
  | 'Teletext'
  | 'Extra'
  | 'Minus'
  | 'ArrowRight'
  | 'ArrowLeft'
  | 'ArrowUp'
  | 'ArrowDown';

export interface TVInputDeviceKey {
  name: TVInputDeviceKeyName;
  code: number;
}

export type PlayerState = 'NONE' | 'IDLE' | 'READY' | 'PLAYING' | 'PAUSED';
export type Properties = {
  NETWORK: { networkType: string; ipAddress: string };
  ETHERNET_NETWORK: { networkType: string; ipAddress: string };
  WIFI_NETWORK: { networkType: string; ipAddress: string };
  DISPLAY: { resolutionWidth: number; resolutionHeight: number };
};

export type TizenErrorCallback = (error: unknown) => void;

export interface AVPlayListeners {
  onbufferingstart?: () => void;
  onbufferingprogress?: (percent: number) => void;
  onbufferingcomplete?: () => void;
  oncurrentplaytime?: (time: number) => void;
  onevent?: (eventType: string, eventData: string) => void;
  onstreamcompleted?: () => void;
  onerror?: (eventType: string) => void;
  onerrormsg?: (eventType: string, eventMsg: string) => void;
  onsubtitlechange?: (duration: number, text: string, type, attriCount, attributes) => void;
  ondrmevent?: (drmEvent: string, drmData: string) => void;
}

export type DownloadNetworkType = 'WIFI' | 'CELLULAR' | 'ALL';
export type DownloadState =
  | 'QUEUED'
  | 'DOWNLOADING'
  | 'PAUSED'
  | 'CANCELED'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABANDONED';

export class DownloadRequest {
  url: string;
  destination: string;
  fileName: string;
  networkType: DownloadNetworkType;
  autoDelete: boolean;

  constructor(url: string);
}

export type DownloadManagerEventType = 'DOWNLOAD_STARTED' | 'DOWNLOAD_PAUSED' | 'DOWNLOAD_RESUMED';

export interface DownloadManagerListener {
  ondownloadstarted?: (downloadId: number) => void;
  ondownloadpaused?: (downloadId: number) => void;
  ondownloadresumed?: (downloadId: number) => void;
  ondownloadprogress?: (downloadId: number, receivedSize: number, totalSize: number) => void;
  ondownloadcompleted?: (downloadId: number, path: string) => void;
  ondownloadcanceled?: (downloadId: number) => void;
  ondownloadfailed?: (downloadId: number, error: unknown) => void;
}

export interface DownloadRequestStartOptions {
  request: DownloadRequest;
  listener?: DownloadManagerListener;
}

export type DownloadManager = {
  start: (request: DownloadRequest, listener?: DownloadManagerListener) => Promise<number>;
  pause: (downloadId: number) => Promise<void>;
  resume: (downloadId: number) => Promise<void>;
  cancel: (downloadId: number) => Promise<void>;
  getState: (downloadId: number) => Promise<DownloadState>;
  setListener: (listener: DownloadManagerListener | null) => void;
};

export interface Tizen {
  systeminfo: {
    getPropertyValue: <K extends keyof Properties>(
      key: K,
      callback: (value: Properties[K]) => void
    ) => void;
  };
  tvinputdevice: {
    registerKey: (key: TVInputDeviceKeyName) => void;
    unregisterKey: (key: TVInputDeviceKeyName) => void;
    getSupportedKeys: () => TVInputDeviceKey[];
  };
  application: {
    getAppBasePath: () => string;
    getCurrentApplication: () => { exit: () => void };
  };
  systemevent: {
    listen: (eventType: string, listener: (data: unknown) => void) => void;
    stopListening: (eventType: string, listener: (data: unknown) => void) => void;
  };
  download: {
    getDownloadManager: () => DownloadManager;
  };
}

declare global {
  interface Window {
    tizen: Tizen;
    REMOTE_KEY_MAP: Record<string, number>;
    INVERTED_REMOTE_KEY_MAP: Record<string, TVInputDeviceKeyName>;
  }
}

export {};
