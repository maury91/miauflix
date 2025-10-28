import '@testing-library/jest-dom/vitest';

import { vi } from 'vitest';

// Mock gsap to avoid module resolution issues during unit tests
vi.mock('gsap', () => ({
  gsap: {
    set: vi.fn(),
    to: vi.fn(),
    fromTo: vi.fn(),
    timeline: vi.fn(() => ({
      set: vi.fn(),
      to: vi.fn(),
      fromTo: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      kill: vi.fn(),
    })),
  },
  ExpoScaleEase: {
    config: vi.fn(),
  },
}));

vi.mock('gsap/EasePack', () => ({
  ExpoScaleEase: {
    config: vi.fn(),
  },
}));

vi.mock('styled-components', async () => {
  const actual = await vi.importActual('styled-components');
  return {
    ...actual,
    keyframes: vi.fn(() => 'mocked-keyframes'),
    css: vi.fn(() => 'mocked-css'),
  };
});

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
