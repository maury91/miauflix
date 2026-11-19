import { describe, expect, it, vi } from 'vitest';

import { FontEpoch, type FontSet } from './fontEpoch';

function fontSet(status: 'loading' | 'loaded') {
  let resolve!: () => void;
  const listeners = new Set<() => void>();
  const loaded = new Set<string>();
  const loads: Array<{ font: string; settle: (ok: boolean) => void }> = [];
  const fonts = {
    status: status as string,
    ready: new Promise<void>(done => (resolve = done)),
    check: (font: string) => loaded.has(font),
    load: (font: string) =>
      new Promise<unknown>((done, fail) =>
        loads.push({ font, settle: ok => (ok ? done([]) : fail(new Error('failed'))) })
      ),
    addEventListener: (_: 'loadingdone', listener: () => void) => listeners.add(listener),
    removeEventListener: (_: 'loadingdone', listener: () => void) => listeners.delete(listener),
  } satisfies FontSet;
  return {
    fonts,
    loaded,
    loads,
    /** A font load ended (the set is loaded again). */
    loadingDone() {
      fonts.status = 'loaded';
      resolve();
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

const tick = () => new Promise(resolve => setTimeout(resolve));

describe('FontEpoch', () => {
  it('is ready at once without a font set or with its fonts loaded', () => {
    expect(new FontEpoch(undefined, vi.fn()).ready).toBe(true);
    expect(new FontEpoch(fontSet('loaded').fonts, vi.fn()).ready).toBe(true);
  });

  it('waits for the first fonts without a new epoch', async () => {
    const set = fontSet('loading');
    const onChange = vi.fn();
    const epoch = new FontEpoch(set.fonts, onChange);
    expect(epoch.ready).toBe(false);

    set.loadingDone();
    await set.fonts.ready;
    expect(epoch.ready).toBe(true);
    expect(epoch.value).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('holds a text until its face is loaded, asking for it once', async () => {
    const set = fontSet('loaded');
    const onChange = vi.fn();
    const epoch = new FontEpoch(set.fonts, onChange);
    const font = '600 16px Poppins, sans-serif';

    expect(epoch.fontReady(font, '4K')).toBe(false);
    expect(epoch.fontReady(font, '4K')).toBe(false);
    expect(set.loads).toHaveLength(1);

    set.loaded.add(font);
    set.loads[0].settle(true);
    await tick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(epoch.fontReady(font, '4K')).toBe(true);
    // Its own load ending is no reason to draw everything again
    set.loadingDone();
    expect(epoch.value).toBe(0);
  });

  it('draws in the fallback when the face fails, and redraws once a font loads later', async () => {
    const set = fontSet('loaded');
    const onChange = vi.fn();
    const epoch = new FontEpoch(set.fonts, onChange);
    const font = '700 16px Poppins, sans-serif';

    expect(epoch.fontReady(font, 'Dune')).toBe(false);
    set.loads[0].settle(false);
    await tick();
    expect(epoch.fontReady(font, 'Dune')).toBe(true);

    set.loadingDone();
    expect(epoch.value).toBe(1);
    expect(onChange).toHaveBeenCalledTimes(2);
    // Asked for again in the new epoch
    expect(epoch.fontReady(font, 'Dune')).toBe(false);
  });

  it('stops listening once disposed', () => {
    const set = fontSet('loaded');
    const epoch = new FontEpoch(set.fonts, vi.fn());
    epoch.dispose();
    expect(set.listeners.size).toBe(0);
  });
});
