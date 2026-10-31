import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/config/constants', () => ({ builtForTizen: true }));

import { artworkUrl } from './media.utils';

describe('artworkUrl on the Samsung TV', () => {
  it('asks for small images, which the TV decodes on every paint', () => {
    expect(artworkUrl('/image.jpg', 'backdrop', 1920)).toContain('/w780/');
    expect(artworkUrl('/image.jpg', 'card', 380)).toContain('/w300/');
  });
});
