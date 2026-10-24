import { installBrowserMeasurements } from '@app/browserMeasurements';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, describe, expect, it } from 'vitest';

import { initialMeasurementsState, measurementsSlice, selectWindowSize } from './measurements';

const setWindow = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
};

describe('measurements', () => {
  const original = { width: window.innerWidth, height: window.innerHeight };
  afterEach(() => setWindow(original.width, original.height));

  const makeStore = () => configureStore({ reducer: { measurements: measurementsSlice.reducer } });

  it('measures the window on install and on every resize, until uninstalled', () => {
    const store = makeStore();
    setWindow(1280, 720);
    const uninstall = installBrowserMeasurements(store.dispatch);
    expect(selectWindowSize(store.getState())).toEqual({ width: 1280, height: 720 });

    setWindow(1920, 1080);
    window.dispatchEvent(new Event('resize'));
    expect(selectWindowSize(store.getState())).toEqual({ width: 1920, height: 1080 });

    uninstall();
    setWindow(800, 600);
    window.dispatchEvent(new Event('resize'));
    expect(selectWindowSize(store.getState())).toEqual({ width: 1920, height: 1080 });
  });

  it('keeps the same state object when the size has not changed', () => {
    const store = makeStore();
    setWindow(1280, 720);
    installBrowserMeasurements(store.dispatch)();
    const before = store.getState().measurements;
    installBrowserMeasurements(store.dispatch)();
    expect(store.getState().measurements).toBe(before);
  });

  it('defaults to a desktop size before the browser reports', () => {
    expect(selectWindowSize(makeStore().getState())).toEqual(initialMeasurementsState.window);
    expect(selectWindowSize({})).toEqual({ width: 1920, height: 1080 });
  });
});
