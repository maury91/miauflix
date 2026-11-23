import { afterEach, describe, expect, it, vi } from 'vitest';

import { firstStripStop, lastGridStop, SeekThumbnailLoader } from './seek-thumbnails';

describe('seek thumbnails', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens the strip on the nearest grid moment in the direction pressed', () => {
    expect(firstStripStop(64, 1, 600)).toBe(70);
    expect(firstStripStop(64, -1, 600)).toBe(60);
    expect(firstStripStop(60, -1, 600)).toBe(50);
    expect(firstStripStop(3, -1, 600)).toBe(0);
    expect(firstStripStop(597, 1, 600)).toBe(lastGridStop(600));
    expect(lastGridStop(600)).toBe(590);
    // Just past a grid moment, that moment is inside the video
    expect(lastGridStop(600.05)).toBe(600);
    expect(lastGridStop(595)).toBe(590);
    expect(lastGridStop(4)).toBe(0);
    expect(lastGridStop(0)).toBe(0);
  });

  it('keeps no frame whose body arrives after it was disposed', async () => {
    let finish: (blob: Blob) => void = () => undefined;
    const response = { ok: true, blob: () => new Promise<Blob>(resolve => (finish = resolve)) };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response))
    );
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:frame');
    const loader = new SeekThumbnailLoader('/api/stream/key/audio');

    const load = loader.load(70, new AbortController().signal);
    await Promise.resolve();
    loader.dispose();
    finish(new Blob(['jpeg']));

    await expect(load).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(loader.cached(70)).toBeUndefined();
  });
});
