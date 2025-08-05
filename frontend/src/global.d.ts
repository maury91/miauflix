import type { TVInputDeviceKeyName } from './tizen';

declare global {
  interface Window {
    API_URL: string;
    AVAILABLE_CODECS: string[];
    REMOTE_KEY_MAP: Partial<Record<TVInputDeviceKeyName, number>>;
    INVERTED_REMOTE_KEY_MAP: Record<number, TVInputDeviceKeyName>;
  }
}

// Unplugin-icons type declarations
declare module '~icons/*' {
  import type { ComponentType, SVGProps } from 'react';
  const component: ComponentType<SVGProps<SVGSVGElement>>;
  export default component;
}

// Must import or export something in order to work
export type X = string;
