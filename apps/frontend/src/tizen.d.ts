export interface TrackInfo {
  extra_info: string; // JSON
  // "{\"language\":\"eng\",\"channels\":\"6\",\"sample_rate\":\"48000\",\"bit_rate\":\"768000\",\"fourCC\":\"eac3\"}"
  index: number;
  type: 'AUDIO' | 'VIDEO' | 'TEXT';
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
  | 'Minus';

export interface TVInputDeviceKey {
  name: TVInputDeviceKeyName;
  code: number;
}

export type PlayerState = 'NONE' | 'IDLE' | 'READY' | 'PLAYING' | 'PAUSED';

declare global {
  interface Window {
    tizen: {
      systeminfo: {
        getPropertyValue: (
          type: string,
          cb: (info: { networkType: string; ipAddress: string }) => void
        ) => void;
      };
      tvinputdevice: {
        getSupportedKeys: () => TVInputDeviceKey[];
        registerKey: (key: TVInputDeviceKeyName) => void;
      };
    };
    webapis: {
      avplay: {
        open: (url: string) => 'success' | string;
        setDisplayRect: (
          x: number,
          y: number,
          width: number,
          height: number
        ) => 'success' | string;
        prepare: () => void;
        play: () => 'success' | string;
        pause: () => 'success' | string;
        getState: () => PlayerState;
        getDuration: () => number; // in milliseconds
        getCurrentTime: () => number; // in milliseconds
        prepareAsync: (successCb: () => void, errorCb: () => void) => void;
        setDisplayMethod: (method: string) => 'success' | string;
        getTotalTrackInfo: () => TrackInfo[];
        setSelectTrack: (
          type: 'AUDIO' | 'VIDEO' | 'TEXT',
          index: number
        ) => 'success' | string;
        setListener: (listeners: {
          onbufferingstart?: () => void;
          onbufferingprogress?: (percent: number) => void;
          onbufferingcomplete?: () => void;
          oncurrentplaytime?: (time: number) => void;
          onevent?: (eventType: string, eventData: string) => void;
          onstreamcompleted?: () => void;
          onerror?: (eventType: string) => void;
          onerrormsg?: (eventType: string, eventMsg: string) => void;
          onsubtitlechange?: (
            duration: number,
            text: string,
            data3: string,
            data4: string
          ) => void;
          ondrmevent?: (drmEvent: string, drmData: string) => void;
        }) => void;
      };
    };
  }
}
