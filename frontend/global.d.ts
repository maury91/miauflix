export {};

declare global {
  interface Window {
    _miauwatchAnimationComplete?: boolean;
    API_URL?: string;
    requestIdleCallback?: (callback: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  }
}
