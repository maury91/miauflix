import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSubtitleFont } from './subtitle-font';

class FakeFontFace {
  constructor(
    readonly family: string,
    readonly source: ArrayBuffer,
    readonly descriptors: FontFaceDescriptors
  ) {}
  load = vi.fn(async () => this);
}

describe('useSubtitleFont', () => {
  const fonts = { add: vi.fn(), delete: vi.fn() };

  beforeEach(() => {
    vi.stubGlobal('FontFace', FakeFontFace);
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('registers the fetched font across all weights and removes it when the track changes', async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([0, 1, 0, 0])));
    vi.stubGlobal('fetch', fetch);
    const { result, rerender } = renderHook(({ url }) => useSubtitleFont(url), {
      initialProps: { url: '/api/subtitles/tracks/abc/font?streamingKey=k' as string | null },
    });
    await waitFor(() => expect(result.current).toMatch(/^miauflix-subtitle-\d+$/));
    const face = fonts.add.mock.calls[0][0] as FakeFontFace;
    expect(face.family).toBe(result.current);
    expect(face.descriptors).toEqual({ weight: '100 900' });

    act(() => rerender({ url: null }));
    expect(result.current).toBeUndefined();
    expect(fonts.delete).toHaveBeenCalledWith(face);
  });

  it('keeps the default font when the release has none', async () => {
    const fetch = vi.fn(async () => new Response('Font is unavailable', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useSubtitleFont('/font'));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current).toBeUndefined();
    expect(fonts.add).not.toHaveBeenCalled();
  });
});
