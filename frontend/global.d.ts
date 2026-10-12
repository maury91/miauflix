export {};

declare global {
  interface Window {
    _miauflixAnimationComplete?: boolean;
    API_URL?: string;
    requestIdleCallback?: (callback: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  }
}
