import { CARD_IMAGE_SIZES } from '@miauflix/service-contracts';
import { describe, expect, it } from 'bun:test';
import sharp from 'sharp';

import {
  cardImageCacheBytes,
  CardImageService,
  providerImageUrl,
} from '../src/services/card-image.service';
import { ByteLru } from '../src/utils/byte-lru';

const bytes = (length: number) => new Uint8Array(length);

describe('ByteLru', () => {
  it('drops the least recently used entries past its capacity', () => {
    const cache = new ByteLru<Uint8Array>(10);
    cache.set('a', bytes(4));
    cache.set('b', bytes(4));
    expect(cache.get('a')).toBeDefined(); // a is now the most recent
    cache.set('c', bytes(4));
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
    expect(cache.bytes).toBe(8);
  });

  it('never keeps an entry larger than the capacity, and replaces in place', () => {
    const cache = new ByteLru<Uint8Array>(10);
    cache.set('a', bytes(4));
    cache.set('big', bytes(11));
    expect(cache.get('big')).toBeUndefined();
    cache.set('a', bytes(6));
    expect(cache.bytes).toBe(6);
    expect(cache.size).toBe(1);
  });

  it('shrinks at once when resized', () => {
    const cache = new ByteLru<Uint8Array>(10);
    cache.set('a', bytes(4));
    cache.set('b', bytes(4));
    cache.resize(5);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeDefined();
    cache.resize(0);
    expect(cache.size).toBe(0);
  });
});

describe('cardImageCacheBytes', () => {
  it('reads megabytes, defaulting to 100', () => {
    expect(cardImageCacheBytes(undefined)).toBe(100 * 1024 * 1024);
    expect(cardImageCacheBytes('')).toBe(100 * 1024 * 1024);
    expect(cardImageCacheBytes('8')).toBe(8 * 1024 * 1024);
    expect(cardImageCacheBytes('0')).toBe(0);
    expect(cardImageCacheBytes('nope')).toBe(100 * 1024 * 1024);
  });
});

describe('providerImageUrl', () => {
  it('swaps the rendition of provider URLs and completes bare paths', () => {
    expect(providerImageUrl('https://image.tmdb.org/t/p/w300/a.jpg', 'w780')).toBe(
      'https://image.tmdb.org/t/p/w780/a.jpg'
    );
    expect(providerImageUrl('http://localhost:9/t/p/original/a.png', 'w500')).toBe(
      'http://localhost:9/t/p/w500/a.png'
    );
    expect(providerImageUrl('/a.jpg', 'w780')).toBe('https://image.tmdb.org/t/p/w780/a.jpg');
  });
});

const solid = (width: number, height: number, color: string, alpha = false) =>
  sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 255, g: 0, b: 0, alpha: 1 } : color,
    },
  })
    .png()
    .toBuffer();

const fakeProvider = () => {
  const requests: string[] = [];
  let failLogo = false;
  const fetcher = async (url: string) => {
    requests.push(url);
    if (url.includes('logo')) {
      if (failLogo) throw new Error('logo unavailable');
      return solid(400, 100, '#f00', true);
    }
    return solid(780, 439, '#204060');
  };
  return {
    requests,
    fetcher,
    failLogos: (fail: boolean) => {
      failLogo = fail;
    },
  };
};

const source = {
  backdrop: 'https://image.tmdb.org/t/p/w300/backdrop.jpg',
  logo: 'https://image.tmdb.org/t/p/w300/logo.png',
  title: 'Dune',
};

describe('CardImageService', () => {
  it('draws each size and format from one master, at the requested renditions', async () => {
    const provider = fakeProvider();
    const service = new CardImageService(10 * 1024 * 1024, provider.fetcher);
    for (const size of ['sm', 'md', 'lg'] as const) {
      const jpeg = await service.render(source, size, 'jpeg');
      const meta = await sharp(jpeg.bytes).metadata();
      expect(jpeg.contentType).toBe('image/jpeg');
      expect([meta.format, meta.width, meta.height]).toEqual([
        'jpeg',
        CARD_IMAGE_SIZES[size].width,
        CARD_IMAGE_SIZES[size].height,
      ]);
    }
    const webp = await service.render(source, 'sm', 'webp');
    expect(webp.contentType).toBe('image/webp');
    expect((await sharp(webp.bytes).metadata()).format).toBe('webp');
    // One backdrop and one logo download for every variant
    expect(provider.requests.sort()).toEqual([
      'https://image.tmdb.org/t/p/w500/logo.png',
      'https://image.tmdb.org/t/p/w780/backdrop.jpg',
    ]);
  });

  it('draws the logo in the logo box, above the overlay line', async () => {
    const provider = fakeProvider();
    const service = new CardImageService(10 * 1024 * 1024, provider.fetcher);
    const image = await service.render(source, 'lg', 'jpeg');
    const { data, info } = await sharp(image.bytes).raw().toBuffer({ resolveWithObject: true });
    const red = (x: number, y: number) => {
      const at = (y * info.width + x) * info.channels;
      return data[at] > 200 && data[at + 1] < 80;
    };
    // The 4:1 logo fills the box's width (64% of 780 = 499 px) and ends at 66% of the height
    expect(red(60, 270)).toBe(true);
    expect(red(530, 270)).toBe(true);
    expect(red(550, 270)).toBe(false);
    expect(red(60, 300)).toBe(false);
    expect(red(60, 150)).toBe(false);
  });

  it('serves repeats from the cache and shares concurrent draws', async () => {
    const provider = fakeProvider();
    const service = new CardImageService(10 * 1024 * 1024, provider.fetcher);
    const [a, b] = await Promise.all([
      service.render(source, 'sm', 'jpeg'),
      service.render(source, 'sm', 'jpeg'),
    ]);
    expect(a.bytes).toBe(b.bytes);
    expect((await service.render(source, 'sm', 'jpeg')).bytes).toBe(a.bytes);
    expect(provider.requests).toHaveLength(2);
    expect(service.cachedBytes).toBeGreaterThan(a.bytes.byteLength);
  });

  it('draws the name without a logo, and changes the image when the name does', async () => {
    const provider = fakeProvider();
    const service = new CardImageService(10 * 1024 * 1024, provider.fetcher);
    const named = await service.render({ ...source, logo: '' }, 'sm', 'jpeg');
    const renamed = await service.render({ ...source, logo: '', title: 'Arrival' }, 'sm', 'jpeg');
    expect(named.etag).not.toBe(renamed.etag);
    expect(provider.requests.some(url => url.includes('logo'))).toBe(false);
    // With a logo the name is not drawn: renaming keeps the image
    const logo = await service.render(source, 'sm', 'jpeg');
    expect((await service.render({ ...source, title: 'Arrival' }, 'sm', 'jpeg')).etag).toBe(
      logo.etag
    );
  });

  it('fails without caching when an image cannot be downloaded', async () => {
    const provider = fakeProvider();
    const service = new CardImageService(10 * 1024 * 1024, provider.fetcher);
    provider.failLogos(true);
    expect(service.render(source, 'sm', 'jpeg')).rejects.toThrow('logo unavailable');
    await Bun.sleep(0);
    provider.failLogos(false);
    expect((await service.render(source, 'sm', 'jpeg')).bytes.byteLength).toBeGreaterThan(0);
  });
});
