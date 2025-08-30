// Jest setup file
import '@testing-library/jest-dom';

// Mock gsap to avoid module resolution issues
jest.mock('gsap', () => ({
  gsap: {
    set: jest.fn(),
    to: jest.fn(),
    fromTo: jest.fn(),
    timeline: jest.fn(() => ({
      set: jest.fn(),
      to: jest.fn(),
      fromTo: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      kill: jest.fn(),
    })),
  },
  ExpoScaleEase: {
    config: jest.fn(),
  },
}));

// Mock gsap/EasePack
jest.mock('gsap/EasePack', () => ({
  ExpoScaleEase: {
    config: jest.fn(),
  },
}));

// Icons are handled through moduleNameMapper in jest.config.ts

// Global test utilities
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});
