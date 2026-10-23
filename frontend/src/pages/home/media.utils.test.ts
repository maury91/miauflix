import { afterEach, describe, expect, it, vi } from 'vitest';

import { artworkUrl, getImageUrl } from './media.utils';

afterEach(() => vi.unstubAllGlobals());

describe('artwork sizing', () => {
  it('normalizes stale absolute TMDB references while preserving other assets', () => {
    expect(getImageUrl('https://image.tmdb.org/t/p/original/image.jpg', 'w300')).toBe(
      'https://image.tmdb.org/t/p/w300/image.jpg'
    );
    expect(getImageUrl('/image.jpg', 'w300')).toBe('https://image.tmdb.org/t/p/w300/image.jpg');
    for (const asset of ['/assets/image.jpg', 'https://example.com/image.jpg', '']) {
      expect(getImageUrl(asset, 'w300')).toBe(asset);
    }
  });

  it('selects a size for each use and pixel density', () => {
    vi.stubGlobal('devicePixelRatio', 1);
    expect(artworkUrl('/image.jpg', 'card', 253)).toContain('/w300/');
    expect(artworkUrl('/image.jpg', 'logo', 280)).toContain('/w300/');
    expect(artworkUrl('/image.jpg', 'backdrop', 1280)).toContain('/w1280/');
    expect(artworkUrl('/image.jpg', 'still', 253)).toContain('/w300/');
    vi.stubGlobal('devicePixelRatio', 2);
    expect(artworkUrl('/image.jpg', 'card', 253)).toContain('/w780/');
    expect(artworkUrl('/image.jpg', 'logo', 280)).toContain('/w500/');
    expect(artworkUrl('/image.jpg', 'backdrop', 1280)).toContain('/original/');
  });
});
