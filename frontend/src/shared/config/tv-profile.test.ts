import { afterEach, describe, expect, it, vi } from 'vitest';

import { heroBackdropSizes, readTvDevice } from './tv-profile';

const AUTO = { moving: 'auto', resting: 'auto' };
// The two TVs Miauflix was measured on
const TU8072_AGENT =
  'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36';
const QCQ80_AGENT =
  'Mozilla/5.0 (SMART-TV; LINUX; Tizen 9.0) AppleWebKit/537.36 (KHTML, like Gecko) 120.0.6099.5/9.0 TV Safari/537.36';

describe('heroBackdropSizes', () => {
  it('picks the sizes for the TV model year', () => {
    expect(heroBackdropSizes({ modelYear: 2020, chromium: 69, screenWidth: 1920 }, AUTO)).toEqual({
      moving: 'w780',
      resting: 'w1280',
    });
    // An updated Tizen does not make an older TV faster
    expect(
      heroBackdropSizes({ modelYear: 2020, chromium: 120, screenWidth: 1920 }, AUTO).moving
    ).toBe('w780');
    expect(heroBackdropSizes({ modelYear: 2023, chromium: 120, screenWidth: 1920 }, AUTO)).toEqual({
      moving: 'w1280',
      resting: 'original',
    });
  });

  it('asks for no more than covers the hero on a smaller screen', () => {
    expect(heroBackdropSizes({ modelYear: 2023, chromium: 120, screenWidth: 1280 }, AUTO)).toEqual({
      moving: 'w1280',
      resting: 'w1280',
    });
    expect(heroBackdropSizes({ modelYear: 2020, chromium: 69, screenWidth: 960 }, AUTO)).toEqual({
      moving: 'w780',
      resting: 'w780',
    });
  });

  it('dates a TV without a model code by its browser', () => {
    expect(
      heroBackdropSizes({ modelYear: null, chromium: 69, screenWidth: 1920 }, AUTO).moving
    ).toBe('w780');
    expect(
      heroBackdropSizes({ modelYear: null, chromium: 94, screenWidth: 1920 }, AUTO).moving
    ).toBe('w1280');
    expect(
      heroBackdropSizes({ modelYear: null, chromium: null, screenWidth: 1920 }, AUTO).moving
    ).toBe('w780');
  });

  it('uses the packaged sizes, and auto for one it does not know', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      heroBackdropSizes(
        { modelYear: 2020, chromium: 69, screenWidth: 1920 },
        { moving: 'w300', resting: 'original' }
      )
    ).toEqual({ moving: 'w300', resting: 'original' });
    expect(
      heroBackdropSizes(
        { modelYear: 2023, chromium: 120, screenWidth: 1920 },
        { moving: 'huge', resting: 'auto' }
      )
    ).toEqual({ moving: 'w1280', resting: 'original' });
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('readTvDevice', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.webapis;
  });

  it('reads the model year and the browser version', () => {
    vi.stubGlobal('navigator', { userAgent: QCQ80_AGENT });
    vi.stubGlobal('innerWidth', 1920);
    window.webapis = {
      productinfo: { isUdPanelSupported: () => false, getModelCode: () => '23_PTM_QTV_T09' },
    } as never;
    expect(readTvDevice()).toEqual({ modelYear: 2023, chromium: 120, screenWidth: 1920 });
  });

  it('reads the browser version alone without productinfo', () => {
    vi.stubGlobal('navigator', { userAgent: TU8072_AGENT });
    vi.stubGlobal('innerWidth', 1920);
    expect(readTvDevice()).toEqual({ modelYear: null, chromium: 69, screenWidth: 1920 });

    window.webapis = {
      productinfo: {
        isUdPanelSupported: () => false,
        getModelCode: () => {
          throw new Error('SecurityError');
        },
      },
    } as never;
    expect(readTvDevice()).toEqual({ modelYear: null, chromium: 69, screenWidth: 1920 });
  });
});
