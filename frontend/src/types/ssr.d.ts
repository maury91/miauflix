// Type declarations for SSR detection
declare global {
  interface Window {
    __SSR__?: boolean;
  }

  // Also declare it on the global object for SSR environment
  var __SSR__: boolean | undefined;
}

export {};
