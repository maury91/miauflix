export interface TrackInfo {
  extra_info: string; // JSON
  // "{\"language\":\"eng\",\"channels\":\"6\",\"sample_rate\":\"48000\",\"bit_rate\":\"768000\",\"fourCC\":\"eac3\"}"
  index: number;
  type: 'AUDIO' | 'VIDEO' | 'TEXT';
}

export interface VideoTrackExtraInfo {
  fourCC: string; // Codec, example: H264
  Width: number;
  height: number;
  Bit_rate: number;
}

export interface AudioTrackExtraInfo {
  fourCC: string; // Codec, example: AACL
  language: string;
  channels: number;
  sample_rate: number;
  bit_rate: number;
}

export interface TextTrackExtraInfo {
  fourCC: string; // Format, example: TTML
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
  constructor(
    url: string,
    destination?: string,
    fileName?: string,
    networkType?: DownloadNetworkType,
    headers?: object
  ) {
    return this;
  }
}

export interface DownloadListeners {
  onprogress?: (id: number, received: number, total: number) => void;
  onpaused?: (id: number) => void;
  oncanceled?: (id: number) => void;
  oncompleted?: (id: number, path: string) => void;
  onfailed?: (id: number, error: string) => void;
}

export interface TizenFileStream {
  eof: boolean;
  position: number;
  bytesAvailable: number;
  close(): void;
  read(charCount: number): string;
  readBytes(byteCount: number): ArrayBuffer;
  readBase64(charCount: number): string;
  write(data: string): void;
  writeBytes(data: ArrayBuffer): void;
  writeBase64(data: string): void;
}

export interface TizenFile {
  parent: TizenFile | null;
  readOnly: boolean;
  isFile: boolean;
  isDirectory: boolean;
  created: Date | null;
  modified: Date | null;
  path: string;
  name: string;
  fullPath: string;
  fileSize: number;
  length: number;
  toURI(): string;
  listFiles(
    successCb: (files: TizenFile[]) => void,
    errorCb?: TizenErrorCallback,
    filter?: object // ToDo: Define filter
  ): void;
  openStream(
    mode: TizenFileMode,
    successCb: (stream: TizenFileStream) => void,
    errorCb?: TizenErrorCallback,
    encoding?: string
  ): void;
  readAsText(
    successCb: (text: string) => void,
    errorCb?: TizenErrorCallback,
    encoding?: string
  ): void;
  copyTo(
    origin: string,
    destination: string,
    overwrite: boolean,
    successCb?: () => void,
    errorCb?: TizenErrorCallback
  ): void;
  moveTo(
    origin: string,
    destination: string,
    overwrite: boolean,
    successCb?: () => void,
    errorCb?: TizenErrorCallback
  ): void;
  createDirectory(dirPath: string): TiizenFile;
  createFile(relativeFilePath: string): TizenFile;
  resolve(filePath: string): TizenFile;
  deleteDirectory(
    directoryPath: string,
    recursive: boolean,
    successCb?: () => void,
    errorCb?: TizenErrorCallback
  ): void;
  deleteFile(filePath: string, successCb?: () => void, errorCb?: TizenErrorCallback): void;
}

export type TizenFileMode = 'r' | 'w' | 'rw' | 'a';

declare global {
  interface Window {
    tizen: {
      systeminfo: {
        getPropertyValue: <T extends keyof Properties>(
          type: T,
          successCb: (info: Properties[T]) => void,
          errorCb?: () => void
        ) => void;
      };
      tvinputdevice: {
        getSupportedKeys: () => TVInputDeviceKey[];
        registerKey: (key: TVInputDeviceKeyName) => void;
      };
      DownloadRequest: typeof DownloadRequest;
      download: {
        start: (request: DownloadRequest, listeners: DownloadListeners) => void;
        cancel: (id: number) => void;
        pause: (id: number) => void;
        abandon: (id: number) => void;
        resume: (id: number) => void;
        getState: (id: number) => DownloadState;
        getDownloadRequest: (id: number) => DownloadRequest;
        getMIMEType: (id: number) => string;
        setListener: (id: number, listeners: DownloadListeners) => void;
      };
      filesystem: {
        resolve: (
          label: string,
          successCb: (file: TizenFile) => void,
          errorCb?: TizenErrorCallback,
          mode?: TizenFileMode
        ) => void;
      };
    };
    webapis: {
      productinfo: {
        isUdPanelSupported(): boolean;
        is8KPanelSupported(): boolean;
      };
      avplay: {
        open(url: string): 'success' | string;
        setDisplayRect(x: number, y: number, width: number, height: number): 'success' | string;
        prepare(): void;
        play(): 'success' | string;
        pause(): 'success' | string;
        stop(): 'success' | string;
        jumpForward(ms: number): 'success' | string;
        jumpBackward(ms: number): 'success' | string;
        setSpeed(speed: number): 'success' | string;
        getState(): PlayerState;
        getDuration(): number; // in milliseconds
        getCurrentTime(): number; // in milliseconds
        prepareAsync(successCb?: () => void, errorCb?: (error: unknown) => void): void;
        setDisplayMethod(method: string): 'success' | string;
        setStreamingProperty(property: 'SET_MODE_4K', value: 'true' | 'false'): void;
        setStreamingProperty(property: 'ADAPTIVE_INFO', value: string): void;
        getTotalTrackInfo(): TrackInfo[];
        seekTo(ms: number, successCb?: () => void, errorCb?: () => void): 'success' | string;
        close(): 'success' | string;
        setSelectTrack(type: 'AUDIO' | 'VIDEO' | 'TEXT', index: number): 'success' | string;
        setListener(listeners: AVPlayListeners): void;
        setSilentSubtitle(silent: boolean): 'success' | string;
        setExternalSubtitlePath(path: string): 'success' | string;
        suspend(): 'success' | string;
        restore(): 'success' | string;
      };
    };
  }
}
