import { TVInputDeviceKeyName } from './tizen';

declare global {
  interface Window {
    API_URL: string;
    AVAILABLE_CODECS: string[];
    REMOTE_KEY_MAP: Partial<Record<TVInputDeviceKeyName, number>>;
    INVERTED_REMOTE_KEY_MAP: Record<number, TVInputDeviceKeyName>;
  }
}

// Must import or export something in order to work
export type X = string;
