/* eslint-disable @typescript-eslint/no-explicit-any */

// SSR-safe mocks for problematic dependencies
import { JSDOM } from 'jsdom';
import React from 'react';

// Set up JSDOM environment for SSR - must happen before any other imports
// Only run during actual SSR rendering (not in tests, storybook, or other tools)
if (
  typeof window === 'undefined' &&
  typeof document === 'undefined' &&
  !process.env['STORYBOOK'] &&
  !process.env['VITEST'] &&
  !process.env['JEST_WORKER_ID']
) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost:4173',
    pretendToBeVisual: true,
    resources: 'usable',
  });

  // Set globals from JSDOM carefully to avoid property assignment issues
  if (!globalThis.window) {
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
  } else {
    Object.assign(globalThis.window, dom.window);
  }
  globalThis.document = dom.window.document;

  // Copy critical constructor functions
  if (dom.window.HTMLElement) {
    globalThis.HTMLElement = dom.window.HTMLElement;
  }
  if (dom.window.Element) {
    globalThis.Element = dom.window.Element;
  }
  if (dom.window.Node) {
    globalThis.Node = dom.window.Node;
  }

  // Copy animation frame functions if they exist
  if (dom.window.requestAnimationFrame) {
    globalThis.requestAnimationFrame = dom.window.requestAnimationFrame;
  }
  if (dom.window.cancelAnimationFrame) {
    globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame;
  }

  // Set up a basic navigator if it doesn't exist
  if (!globalThis.navigator) {
    globalThis.navigator = {
      userAgent: 'Mozilla/5.0 (JSDOM)',
      platform: 'Node.js',
    } as Navigator;
  }

  // Set up window properties for responsive design
  Object.defineProperty(dom.window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 1920,
  });
  Object.defineProperty(dom.window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: 1080,
  });

  // Set SSR detection flag after JSDOM initialization
  Object.defineProperty(dom.window, '__SSR__', {
    writable: false,
    configurable: false,
    value: true,
  });
  globalThis.__SSR__ = true;
}

// Mock gsap for SSR
export const gsap = {
  ticker: { fps: () => {} },
  registerPlugin: () => {},
  set: () => {},
  to: () => ({ kill: () => {} }),
  fromTo: () => ({ kill: () => {} }),
  timeline: () => ({
    set: () => ({ set: () => {}, to: () => {}, play: () => {} }),
    to: () => ({ set: () => {}, to: () => {}, play: () => {} }),
    play: () => {},
    kill: () => {},
  }),
};

export default gsap;

export const ExpoScaleEase = {};

// Mock framer-motion for SSR
export const MotionConfig = ({ children }: { children: React.ReactNode }) => children;
export const AnimatePresence = ({ children }: { children: React.ReactNode }) => children;

// Mock motion component - creates regular div elements for SSR
export const motion = {
  div: (props: any) => React.createElement('div', props),
  span: (props: any) => React.createElement('span', props),
  h1: (props: any) => React.createElement('h1', props),
  h2: (props: any) => React.createElement('h2', props),
  h3: (props: any) => React.createElement('h3', props),
  h4: (props: any) => React.createElement('h4', props),
  h5: (props: any) => React.createElement('h5', props),
  h6: (props: any) => React.createElement('h6', props),
  p: (props: any) => React.createElement('p', props),
  img: (props: any) => React.createElement('img', props),
  button: (props: any) => React.createElement('button', props),
  a: (props: any) => React.createElement('a', props),
  ul: (props: any) => React.createElement('ul', props),
  li: (props: any) => React.createElement('li', props),
  section: (props: any) => React.createElement('section', props),
  article: (props: any) => React.createElement('article', props),
  header: (props: any) => React.createElement('header', props),
  footer: (props: any) => React.createElement('footer', props),
  main: (props: any) => React.createElement('main', props),
  nav: (props: any) => React.createElement('nav', props),
  aside: (props: any) => React.createElement('aside', props),
};

// Mock framer-motion types for SSR
export interface MotionConfigContext {
  transformPagePoint?: any;
  isStatic?: boolean;
  reducedMotion?: 'always' | 'never' | 'user';
}

export const useMotionValue = () => ({ get: () => 0, set: () => {} });
export const useTransform = () => 0;
export const useSpring = () => 0;
export const animate = () => ({ stop: () => {} });

// Mock spatial navigation for SSR
export const init = () => {};
export const pause = () => {};
export const resume = () => {};
export const useFocusable = () => ({
  ref: { current: null },
  focused: false,
  hasFocusedChild: false,
  focusKey: '',
  focusSelf: () => {},
});
export const FocusContext = {
  Provider: ({ children }: { children: React.ReactNode; value?: unknown }) => children,
};
export const setFocus = () => {};
export const getCurrentFocusKey = () => '';
export const updateAllLayouts = () => {};
