import { CARD_IMAGE_SIZES } from '@miauflix/service-contracts';
import { describe, expect, it } from 'bun:test';
import sharp from 'sharp';

import {
  approvedImageUrl,
  cardImageCacheBytes,
  CardImageService,
  fetchImage,
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

describe('approvedImageUrl', () => {
  it('allows TMDB image URLs only', () => {
    expect(approvedImageUrl('https://image.tmdb.org/t/p/w780/a.jpg')).toBe(
      'https://image.tmdb.org/t/p/w780/a.jpg'
    );
    for (const url of [
      'http://image.tmdb.org/t/p/w780/a.jpg',
      'https://image.tmdb.org:8443/t/p/w780/a.jpg',
      'https://evil.example/t/p/w780/a.jpg',
      'http://169.254.169.254/latest/meta-data',
      // Reports https://image.tmdb.org as its origin, but is not an HTTPS URL
      'blob:https://image.tmdb.org/0c1f8f3e-6a4b-4e2f-9d1a-1f2e3d4c5b6a',
      'not a url',
    ])
      expect(() => approvedImageUrl(url)).toThrow();
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

  it('stops reading a download without a length once it passes the size limit', async () => {
    const originalFetch = globalThis.fetch;
    let pulled = 0;
    let cancelled = false;
    const chunk = new Uint8Array(1024 * 1024);
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          // Finite (16 MiB, twice the limit) so a regression fails instead of hanging
          pull(controller) {
            pulled += 1;
            if (pulled > 16) controller.close();
            else controller.enqueue(chunk);
          },
          cancel() {
            cancelled = true;
          },
        })
      )) as unknown as typeof fetch;
    try {
      await expect(fetchImage('https://img/huge.jpg')).rejects.toThrow('Image too large');
      expect(cancelled).toBe(true);
      expect(pulled).toBeLessThan(12);
      globalThis.fetch = (async () =>
        new Response(Uint8Array.from([1, 2, 3]))) as unknown as typeof fetch;
      expect([...(await fetchImage('https://img/small.jpg'))]).toEqual([1, 2, 3]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('refuses to download images from other origins', async () => {
    const provider = fakeProvider();
    const service = new CardImageService(10 * 1024 * 1024, provider.fetcher);
    await expect(
      service.render({ ...source, backdrop: 'https://evil.example/t/p/w300/b.jpg' }, 'sm', 'jpeg')
    ).rejects.toThrow('origin not allowed');
    expect(provider.requests.some(url => url.includes('evil'))).toBe(false);
  });

  it('keeps the slot until both downloads settle when the logo fails', async () => {
    const pending: Array<() => void> = [];
    const started: string[] = [];
    const backdrop = await solid(780, 439, '#204060');
    const fetcher = (url: string) => {
      started.push(url);
      if (url.includes('logo')) return Promise.reject(new Error('logo unavailable'));
      if (url.includes('slow'))
        return new Promise<Buffer>(resolve => pending.push(() => resolve(backdrop)));
      return Promise.resolve(backdrop);
    };
    const service = new CardImageService(10 * 1024 * 1024, fetcher);
    const slow = (n: number) => ({
      backdrop: `https://image.tmdb.org/t/p/w300/slow-${n}.jpg`,
      logo: `https://image.tmdb.org/t/p/w300/logo-${n}.png`,
      title: 'Slow',
    });
    // Four masters fill the slots; each one's logo fails while its backdrop is still downloading
    const failing = [1, 2, 3, 4].map(n =>
      service.render(slow(n), 'sm', 'jpeg').then(
        () => 'drawn',
        (error: Error) => error.message
      )
    );
    const fifth = service.render(
      { backdrop: 'https://image.tmdb.org/t/p/w300/fifth.jpg', logo: '', title: 'Fifth' },
      'sm',
      'jpeg'
    );
    await Bun.sleep(20);
    expect(started.some(url => url.includes('fifth'))).toBe(false);
    for (const release of pending.splice(0)) release();
    expect(await Promise.all(failing)).toEqual(Array(4).fill('logo unavailable'));
    expect((await fifth).bytes.byteLength).toBeGreaterThan(0);
  });

  it('drops a queued drawing once no caller needs it, and shares one until the last leaves', async () => {
    const waits: Array<() => void> = [];
    const backdrop = await solid(780, 439, '#204060');
    const started: string[] = [];
    const fetcher = (url: string) => {
      started.push(url);
      return new Promise<Buffer>(resolve => waits.push(() => resolve(backdrop)));
    };
    const service = new CardImageService(10 * 1024 * 1024, fetcher);
    const titled = (name: string) => ({
      backdrop: `https://image.tmdb.org/t/p/w300/${name}.jpg`,
      logo: '',
      title: 'Name',
    });
    const busy = ['a', 'b', 'c', 'd'].map(name => service.render(titled(name), 'sm', 'jpeg'));
    const first = new AbortController();
    const second = new AbortController();
    const one = service.render(titled('queued'), 'sm', 'jpeg', first.signal);
    const two = service.render(titled('queued'), 'md', 'jpeg', second.signal);
    first.abort(new Error('gone'));
    await expect(one).rejects.toThrow('gone');
    second.abort(new Error('gone too'));
    await expect(two).rejects.toThrow('gone too');
    // The slots free up: the cancelled drawing never starts its download
    for (const release of waits.splice(0)) release();
    await Promise.all(busy);
    await Bun.sleep(10);
    expect(started.some(url => url.includes('queued'))).toBe(false);
  });

  it('keeps a drawing that already started joinable after its callers leave', async () => {
    const waits: Array<() => void> = [];
    const backdrop = await solid(780, 439, '#204060');
    const started: string[] = [];
    const fetcher = (url: string) => {
      started.push(url);
      return new Promise<Buffer>(resolve => waits.push(() => resolve(backdrop)));
    };
    const service = new CardImageService(10 * 1024 * 1024, fetcher);
    const titled = { backdrop: 'https://image.tmdb.org/t/p/w300/a.jpg', logo: '', title: 'Name' };
    const caller = new AbortController();
    const first = service.render(titled, 'sm', 'jpeg', caller.signal);
    await Bun.sleep(0);
    caller.abort(new Error('gone'));
    await expect(first).rejects.toThrow('gone');
    // The retry joins the running drawing instead of downloading the backdrop again
    const retry = service.render(titled, 'sm', 'jpeg');
    for (const release of waits.splice(0)) release();
    expect((await retry).bytes.byteLength).toBeGreaterThan(0);
    expect(started.length).toBe(1);
  });
});
