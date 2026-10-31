import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/config/constants', () => ({ builtForTizen: true }));

import { artworkUrl } from './media.utils';

describe('artworkUrl on the Samsung TV', () => {
  it('never asks for an original backdrop, which the TV is slow to decode', () => {
    expect(artworkUrl('/image.jpg', 'backdrop', 1920)).toContain('/w1280/');
    expect(artworkUrl('/image.jpg', 'card', 380)).toContain('/w780/');
  });
});
